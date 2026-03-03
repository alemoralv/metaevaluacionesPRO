#!/usr/bin/env python3
"""
txt2latex.py
============
Convierte un archivo Excel/CSV de evaluaciones + instrucciones.txt +
informacion.txt en un documento LaTeX.

Uso:
    python txt2latex.py [carpeta_del_proyecto] [input_folder]

  - carpeta_del_proyecto  (default: directorio actual)
      Contiene uno o más folders con formato input_<BOTNAME>.
  - input_folder (opcional)
      Si se omite, se usa el único input_* disponible.
      Cada input debe contener:
        - instrucciones_<BOTNAME>.txt
        - informacion_<BOTNAME>.txt
        - evaluaciones_<BOTNAME>.csv (o excel), generado por corrector.py

Genera los archivos .tex y .pdf en la subcarpeta output/.
"""

import csv
import glob
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from datetime import datetime

import requests

PREFERRED_DATA_FILES = ("evaluaciones.csv",)

# ──────────────────────────────────────────────────────────────────────
# 0. MAPEO DE COLUMNAS  (aliases → nombre interno)
# ──────────────────────────────────────────────────────────────────────

# Cada clave es el nombre interno; los valores son las variantes
# aceptadas (ya en minúsculas y sin espacios extra).
COLUMN_ALIASES: dict[str, list[str]] = {
    "question": [
        "question", "pregunta",
    ],
    "expectedResult": [
        "expected response", "expected_response", "expected result",
        "respuesta esperada",
    ],
    "retrievedContext": [
        "retrieved context", "retrieved_context", "contexto recuperado",
    ],
    "generatorModel": [
        "generator model", "generator_model", "modelo generador",
    ],
    "testMethodType": [
        "testing method", "test method", "testing_method",
        "test method type",
        "testmethodtype",
        "método de prueba", "metodo de prueba",
    ],
    "passingScore": [
        "passing score", "passing_score",
        "puntuación de aprobación", "puntuacion de aprobacion",
    ],
    "actualResponse": [
        "the agent's response", "agent's response", "agent response",
        "actual_response", "respuesta del agente",
    ],
    "result": [
        "result", "resultado",
    ],
    "explanation": [
        "analysis", "explanation",
        "análisis", "analisis", "explicación", "explicacion",
    ],
}


def _strip_accents(text: str) -> str:
    """Elimina acentos para comparaciones robustas."""
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", text)
        if not unicodedata.combining(ch)
    )


def _normalize_header(h: str) -> str:
    """Normaliza encabezados: camel/snake case, acentos y espacios."""
    text = h.strip().replace("_", " ")
    text = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", text)
    text = _strip_accents(text).lower()
    return re.sub(r"\s+", " ", text)


def _build_alias_lookup() -> dict[str, str]:
    """Construye mapa alias_normalizado -> clave interna."""
    alias_lookup: dict[str, str] = {}
    for internal_name, aliases in COLUMN_ALIASES.items():
        for alias in aliases + [internal_name]:
            alias_lookup[_normalize_header(alias)] = internal_name
    return alias_lookup


ALIAS_LOOKUP = _build_alias_lookup()


def _resolve_header(raw_header: str) -> str | None:
    """Devuelve el nombre interno o None si no se reconoce.

    También acepta variantes con sufijos numéricos (p. ej. result_1, result.1).
    """
    normalized = _normalize_header(raw_header)
    resolved = ALIAS_LOOKUP.get(normalized)
    if resolved:
        return resolved

    # Algunos exports duplican columnas con sufijo numérico.
    without_index = re.sub(r"[\s._-]+\d+$", "", normalized).strip()
    if without_index and without_index != normalized:
        return ALIAS_LOOKUP.get(without_index)
    return None


# ──────────────────────────────────────────────────────────────────────
# 1. LECTURA DEL EXCEL / CSV
# ──────────────────────────────────────────────────────────────────────

def _find_data_file(input_dir: str, bot_name: str) -> str:
    """Busca el archivo de evaluación dentro del folder de input."""
    preferred_candidates = (
        f"evaluaciones_{bot_name}.csv",
        f"evaluaciones_{bot_name}.xlsx",
        f"evaluaciones_{bot_name}.xls",
    ) + PREFERRED_DATA_FILES

    for preferred in preferred_candidates:
        preferred_path = os.path.join(input_dir, preferred)
        if os.path.isfile(preferred_path):
            return preferred_path

    patterns = ["*.csv", "*.xlsx", "*.xls"]
    found: list[str] = []
    for pat in patterns:
        found.extend(glob.glob(os.path.join(input_dir, pat)))
    found = sorted(found)
    if not found:
        raise FileNotFoundError(
            "No se encontró ningún archivo .csv / .xlsx / .xls en "
            f"'{input_dir}'."
        )
    if len(found) > 1:
        print(f"[WARN] Se encontraron {len(found)} archivos de datos; "
              f"usando el primero: {found[0]}")
    return found[0]


def _read_csv(path: str) -> list[dict[str, str]]:
    """Lee un CSV y devuelve lista de dicts con claves internas."""
    last_error: UnicodeDecodeError | None = None
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            rows: list[dict[str, str]] = []
            with open(path, newline="", encoding=encoding) as f:
                reader = csv.reader(f)
                raw_headers = next(reader)
                col_map: list[str | None] = [_resolve_header(h) for h in raw_headers]
                if "question" not in col_map:
                    raise ValueError(
                        "No se encontró una columna de pregunta. "
                        f"Encabezados detectados: {raw_headers}"
                    )

                for line in reader:
                    row: dict[str, str] = {}
                    for idx, val in enumerate(line):
                        key = col_map[idx] if idx < len(col_map) else None
                        if key:
                            row[key] = val.strip()
                    if row.get("question"):
                        rows.append(row)
            return rows
        except UnicodeDecodeError as exc:
            last_error = exc
            continue

    if last_error:
        raise last_error
    return []


def _read_excel(path: str) -> list[dict[str, str]]:
    """Lee un .xlsx/.xls y devuelve lista de dicts con claves internas."""
    try:
        import openpyxl
    except ImportError:
        raise ImportError(
            "Se requiere openpyxl para leer archivos Excel.\n"
            "  pip install openpyxl"
        )
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)

    raw_headers = [str(c) if c else "" for c in next(rows_iter)]
    col_map = [_resolve_header(h) for h in raw_headers]
    if "question" not in col_map:
        raise ValueError(
            "No se encontró una columna de pregunta en el Excel. "
            f"Encabezados detectados: {raw_headers}"
        )

    rows: list[dict[str, str]] = []
    for cells in rows_iter:
        row: dict[str, str] = {}
        for idx, val in enumerate(cells):
            key = col_map[idx] if idx < len(col_map) else None
            if key and val is not None:
                row[key] = str(val).strip()
        if row.get("question"):
            rows.append(row)
    wb.close()
    return rows


def read_data_file(input_dir: str, bot_name: str) -> list[dict[str, str]]:
    """Auto-detecta formato y devuelve las filas normalizadas."""
    path = _find_data_file(input_dir, bot_name)
    ext = os.path.splitext(path)[1].lower()
    if ext == ".csv":
        return _read_csv(path)
    elif ext in (".xlsx", ".xls"):
        return _read_excel(path)
    else:
        raise ValueError(f"Formato no soportado: {ext}")


# ──────────────────────────────────────────────────────────────────────
# 2. PARSEO DE informacion.txt  E  instrucciones.txt
# ──────────────────────────────────────────────────────────────────────

def parse_info(input_dir: str, bot_name: str) -> dict:
    """Lee informacion/instrucciones del input folder y devuelve un dict."""
    info_path = os.path.join(input_dir, f"informacion_{bot_name}.txt")
    instr_path = os.path.join(input_dir, f"instrucciones_{bot_name}.txt")

    # Compatibilidad hacia atrás.
    if not os.path.exists(info_path):
        legacy_info_path = os.path.join(input_dir, "informacion.txt")
        if os.path.exists(legacy_info_path):
            info_path = legacy_info_path
    if not os.path.exists(instr_path):
        legacy_instr_path = os.path.join(input_dir, "instrucciones.txt")
        if os.path.exists(legacy_instr_path):
            instr_path = legacy_instr_path

    if not os.path.exists(info_path):
        raise FileNotFoundError(
            f"No se encontró '{info_path}'. Debe existir para generar el reporte."
        )
    if not os.path.exists(instr_path):
        raise FileNotFoundError(
            f"No se encontró '{instr_path}'. Debe existir para generar el reporte."
        )

    with open(info_path, "r", encoding="utf-8") as f:
        raw = f.read()

    with open(instr_path, "r", encoding="utf-8") as f:
        instrucciones = f.read().strip()

    data: dict[str, str] = {
        "evaluador": "",
        "agente": "",
        "modelo": "",
        "instrucciones": instrucciones,
        "conocimiento": "",
        "busqueda_web": "",
        "conocimiento_general": "",
        "orquestacion": "",
        "herramientas": "",
        # ── Nuevos campos (QA manual) ──
        "fase_prueba": "",
        "criterios_aprobacion": "",
        "pruebas": "",
        "kpis": "",
    }

    aliases = {
        "evaluador": "evaluador",
        "agente": "agente",
        "modelo": "modelo",
        "conocimiento": "conocimiento",
        "busqueda web": "busqueda_web",
        "conocimiento general": "conocimiento_general",
        "orquestacion": "orquestacion",
        "herramientas": "herramientas",
        # ── Nuevos aliases ──
        "fase de prueba": "fase_prueba",
        "fase": "fase_prueba",
        "criterios de aprobacion": "criterios_aprobacion",
        "criterios de aprovacion": "criterios_aprobacion",
        "criterios": "criterios_aprobacion",
        "pruebas": "pruebas",
        "kpis": "kpis",
        "kpi": "kpis",
    }

    for line in raw.splitlines():
        if ":" not in line:
            continue
        key_raw, value = line.split(":", 1)
        key_norm = _normalize_header(key_raw)
        mapped = aliases.get(key_norm)
        if mapped:
            data[mapped] = value.strip()

    return data


# ──────────────────────────────────────────────────────────────────────
# 3. UTILIDADES LaTeX
# ──────────────────────────────────────────────────────────────────────

def escape_latex(text: str) -> str:
    """Escapa caracteres especiales de LaTeX."""
    replacements = [
        ("\\", r"\textbackslash{}"),
        ("&",  r"\&"),
        ("%",  r"\%"),
        ("$",  r"\$"),
        ("#",  r"\#"),
        ("_",  r"\_"),
        ("{",  r"\{"),
        ("}",  r"\}"),
        ("~",  r"\textasciitilde{}"),
        ("^",  r"\textasciicircum{}"),
        ("→",  r"$\rightarrow$"),
        ("—",  r"---"),
        ("–",  r"--"),
        ("…",  r"\ldots{}"),
        ("·",  r"{\textperiodcentered}"),
        ("\u200b", ""),
        ("\u00a0", "~"),
        ("\u201c", "``"),
        ("\u201d", "''"),
        ("\u2018", "`"),
        ("\u2019", "'"),
        ("\"", "''"),
        # Use pifont symbols to keep compatibility with local pdflatex setups.
        ("✅",     r"\ding{51}"),
        ("✔",      r"\ding{51}"),
        ("❌",     r"\ding{55}"),
        ("✗",      r"\ding{55}"),
        ("⚠",      r"\ding{115}"),
        ("\ufffd", "?"),
    ]
    for old, new in replacements:
        text = text.replace(old, new)
    # Remove unsupported supplementary-plane glyphs (mostly emoji) for pdflatex.
    text = re.sub(r"[\U00010000-\U0010FFFF]", "", text)
    return text


def enabled_or_disabled(value: str) -> str:
    """Devuelve 'habilitada' o 'deshabilitada' según el valor."""
    val = value.strip().lower()
    if val in ("sí", "si", "s", "yes", "habilitada", "habilitado",
               "activada", "activado", "on", "true", "1"):
        return "habilitada"
    return "deshabilitada"


def _to_console_safe(text: str) -> str:
    """Adapta texto a la codificación de la terminal para evitar UnicodeEncodeError."""
    encoding = sys.stdout.encoding or "utf-8"
    return text.encode(encoding, errors="replace").decode(encoding, errors="replace")


# ──────────────────────────────────────────────────────────────────────
# 3b. GENERADORES LaTeX PARA NUEVAS SECCIONES (QA manual)
# ──────────────────────────────────────────────────────────────────────

def _comma_list_to_latex_items(raw: str) -> str:
    r"""Convierte una cadena separada por comas en \item's LaTeX."""
    items = [s.strip() for s in raw.split(",") if s.strip()]
    if not items:
        return r"\item ---"
    return "\n".join(r"\item " + escape_latex(it) for it in items)


def build_criterios_section(raw: str) -> str:
    """Genera la subsección de Criterios de Aprobación."""
    if not raw.strip():
        return ""
    items_tex = _comma_list_to_latex_items(raw)
    return r"""
\subsection{Criterios de Aprobación}

Los siguientes criterios deben cumplirse para considerar esta fase de
pruebas como formalmente aprobada:

\begin{itemize}
""" + items_tex + r"""
\end{itemize}
"""


def build_pruebas_section(raw: str) -> str:
    """Genera la sección de Pruebas Aplicadas."""
    if not raw.strip():
        return ""
    items_tex = _comma_list_to_latex_items(raw)
    return r"""
\section{Pruebas Aplicadas}

Además de las pruebas funcionales estándar, se ejecutaron (o se
planificaron) las siguientes pruebas específicas para el agente:

\begin{itemize}
""" + items_tex + r"""
\end{itemize}
"""


def build_kpis_section(raw: str) -> str:
    """Genera la sección de KPIs de Calidad."""
    if not raw.strip():
        return ""
    items_tex = _comma_list_to_latex_items(raw)
    return r"""
\section{KPIs de Calidad y Reporteo}

Para dar visibilidad sobre la salud del testing, se definen los siguientes
indicadores. Estos deben registrarse en Jira y reportarse al cierre de
cada fase de pruebas.

\begin{itemize}
""" + items_tex + r"""
\end{itemize}
"""


# ──────────────────────────────────────────────────────────────────────
# 4. BLOQUE DE CONVERSACIÓN (extendido)
# ──────────────────────────────────────────────────────────────────────

# Campos opcionales que se muestran debajo del cuadro del agente,
# en el orden deseado.  (clave interna → etiqueta en el PDF)
_OPTIONAL_FIELDS: list[tuple[str, str]] = [
    ("expectedResult",  "Respuesta esperada"),
    ("testMethodType",  "Método de evaluación"),
    ("passingScore",    "Calificación aprobatoria"),
    ("result",          "Calificación de la respuesta"),
    ("explanation",     "Explicación"),
]


def _format_optional_detail(label: str, value: str) -> str:
    r"""Genera una línea \\footnotesize\\itshape con etiqueta y valor."""
    safe_val = escape_latex(value)
    safe_val = safe_val.replace("\n\n", r"\par ")
    safe_val = safe_val.replace("\n", " ")
    return (
        r"\noindent{\footnotesize\itshape "
        r"\textcolor{profublue}{\textbf{" + escape_latex(label) + r":}} "
        + safe_val + r"}" "\n"
    )


def format_conversation_block(rows: list[dict[str, str]]) -> str:
    """Genera el LaTeX para la sección de conversación."""
    lines: list[str] = []

    for q_num, row in enumerate(rows, start=1):
        question = row.get("question", "")
        response = row.get("actualResponse", "")

        safe_q = escape_latex(question)
        safe_q = safe_q.replace("\n\n", r"\par ")
        safe_q = safe_q.replace("\n", " ")

        safe_r = escape_latex(response)
        safe_r = safe_r.replace("\n\n", r"\par ")
        safe_r = safe_r.replace("\n", " ")

        # ── separador entre preguntas ──
        separator = ""
        if q_num > 1:
            separator = r"""
\vspace{2.5em}"""

        # ── Caja del usuario ──
        lines.append(separator + r"""
\noindent
\begin{minipage}{\textwidth}
\textcolor{profublue}{\textbf{Usuario (%d):}}\\[4pt]
\fcolorbox{profublue!30}{profublue!3}{%%
  \begin{minipage}{0.95\textwidth}
  \smallskip
  %s
  \smallskip
  \end{minipage}}
\end{minipage}""" % (q_num, safe_q))

        # ── Caja del agente ──
        lines.append(r"""
\vspace{0.4em}
\noindent
\begin{minipage}{\textwidth}
\textcolor{profugold!80!black}{\textbf{Agente (%d):}}\\[4pt]
\fcolorbox{profugold!40}{profugold!5}{%%
  \begin{minipage}{0.95\textwidth}
  \smallskip
  %s
  \smallskip
  \end{minipage}}
\end{minipage}""" % (q_num, safe_r))

        # ── Campos opcionales (debajo de la caja del agente) ──
        detail_lines: list[str] = []
        for key, label in _OPTIONAL_FIELDS:
            val = row.get(key, "").strip()
            if val:
                detail_lines.append(_format_optional_detail(label, val))

        if detail_lines:
            lines.append(r"""
\vspace{0.35em}
\noindent
\begin{minipage}{0.95\textwidth}
\setlength{\parskip}{0.25em}
""" + "\n".join(detail_lines) + r"""
\end{minipage}""")

    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────
# 5. GENERACIÓN DEL DOCUMENTO LaTeX
# ──────────────────────────────────────────────────────────────────────

def build_latex(info: dict, rows: list[dict[str, str]]) -> str:
    today = datetime.now().strftime("%d de %B de %Y")
    meses = {
        "January": "enero", "February": "febrero", "March": "marzo",
        "April": "abril", "May": "mayo", "June": "junio",
        "July": "julio", "August": "agosto", "September": "septiembre",
        "October": "octubre", "November": "noviembre", "December": "diciembre",
    }
    for en, es in meses.items():
        today = today.replace(en, es)

    e_name      = escape_latex(info["evaluador"])
    e_agente    = escape_latex(info["agente"])
    e_modelo    = escape_latex(info["modelo"])

    # ── Fase de prueba (portada) ──
    fase_raw = info.get("fase_prueba", "").strip()
    if fase_raw:
        e_fase = escape_latex(fase_raw)
        fase_portada = (
            r"{\Large\bfseries\textcolor{profublue}{Fase de prueba: "
            + e_fase + r"}\par}"
        )
    else:
        fase_portada = ""

    # Instrucciones (párrafos en footnotesize italic)
    e_instruc_raw = escape_latex(info["instrucciones"])
    e_instruc_raw = e_instruc_raw.replace("\n\n", "\x00BREAK\x00")
    e_instruc_raw = e_instruc_raw.replace("\n", " ")
    instruc_paragraphs = [
        p.strip() for p in e_instruc_raw.split("\x00BREAK\x00") if p.strip()
    ]
    e_instruc = "\n\\vspace{0.4em}\n".join(
        r"\noindent\begin{minipage}{\textwidth}" + "\n"
        + r"\footnotesize\itshape " + p + "\n"
        + r"\end{minipage}"
        for p in instruc_paragraphs
    )

    e_kbase  = escape_latex(info["conocimiento"])
    e_orq    = escape_latex(info["orquestacion"])
    e_herr   = escape_latex(info["herramientas"])

    busq_web  = enabled_or_disabled(info["busqueda_web"])
    conoc_gen = enabled_or_disabled(info["conocimiento_general"])

    # ── Nuevas secciones QA ──
    criterios_tex = build_criterios_section(info.get("criterios_aprobacion", ""))
    pruebas_tex   = build_pruebas_section(info.get("pruebas", ""))
    kpis_tex      = build_kpis_section(info.get("kpis", ""))

    conv_tex  = format_conversation_block(rows)

    latex = r"""\documentclass[11pt, a4paper]{article}
%% Idioma y codificación
\usepackage[utf8]{inputenc}
\usepackage[spanish]{babel}
\usepackage[T1]{fontenc}
\usepackage{amsmath}
%% Tipografía y microajustes
\usepackage{lmodern}
\usepackage{microtype}
\usepackage{helvet}
\renewcommand{\familydefault}{\sfdefault}
%% Gráficos / tablas / color
\usepackage{graphicx}
\usepackage{xcolor}
\usepackage{booktabs}
\usepackage{tabularx}
%% Layout y estilo
\usepackage{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{fancyhdr}
%% Utilidades
\usepackage{csquotes}
\usepackage{pifont}
\usepackage{hyperref}
\usepackage{comment}
\usepackage{url}
%% Párrafos
\setlength{\parindent}{0pt}
\setlength{\parskip}{0.7em}
%% Colores de marca
\definecolor{profublue}{HTML}{004a99}
\definecolor{profugold}{HTML}{ffc20e}
%% Márgenes
\geometry{
    top=3cm,
    bottom=3cm,
    left=2.5cm,
    right=2.5cm,
    headheight=40pt
}
%% Encabezado / pie
\pagestyle{fancy}
\fancyhf{}
\rhead{\textcolor{profublue}{\textbf{Evaluación del agente: """ + e_agente + r""" |  """ + e_name + r""" }}}
\cfoot{\thepage}
\renewcommand{\headrulewidth}{0.5pt}
\renewcommand{\headrule}{\hbox to\headwidth{\color{profugold}\leaders\hrule height \headrulewidth\hfill}}
%% Títulos
\titleformat{\section}
{\color{profublue}\Large\bfseries}
{}{0em}{}
\titleformat{\subsection}
{\color{profublue}\large\bfseries}
{}{0em}{}
\titlespacing*{\section}{0pt}{1.2em}{0.5em}
\titlespacing*{\subsection}{0pt}{0.9em}{0.4em}
%% Listas
\setlistdepth{5}
\renewlist{itemize}{itemize}{5}
\setlist[itemize]{leftmargin=*, topsep=6pt, itemsep=3pt, parsep=2pt, labelsep=0.6em}
\setlist[itemize,1]{label=\textcolor{profugold}{\large\textbullet}}
\setlist[itemize,2]{label=\textcolor{profublue}{\normalsize\textbullet}}
\setlist[itemize,3]{label=\textcolor{profugold}{\small\ding{118}}}
\setlist[itemize,4]{label=\textcolor{profugold}{\tiny\textbullet}}
\setlist[itemize,5]{label=\textcolor{profugold}{\tiny\textbullet}}
\setlist[enumerate]{leftmargin=*, topsep=6pt, itemsep=3pt, parsep=2pt, label=\textcolor{profublue}{\arabic*.}}
%% Links
\hypersetup{
  colorlinks=true,
  linkcolor=profublue,
  urlcolor=profublue,
  citecolor=profublue
}

\begin{document}

%% ═══════════════ PORTADA ═══════════════
\begin{titlepage}
    \centering
    \vspace*{2cm}
    {\fontsize{40}{48}\selectfont\bfseries\textcolor{profublue}{Profuturo}\par}
    \vspace{0.8cm}
    {\color{profugold}\rule{0.4\textwidth}{2pt}\par}
    \vspace{1.2cm}
    {\fontsize{28}{34}\selectfont\bfseries\textcolor{profublue}{Evaluación del Agente:}\par}
    {\fontsize{28}{34}\selectfont\bfseries\textcolor{profublue}{""" + e_agente + r"""}\par}
    \vspace{0.6cm}
    """ + fase_portada + r"""
    \vspace{0.8cm}
    {\color{profugold}\rule{0.4\textwidth}{2pt}\par}
    \vspace{2cm}
    {\large\bfseries Equipo de Inteligencia Artificial\par}
    \vspace{0.5cm}
    {\normalsize Reporte: """ + e_name + r""" \par}
    \vspace{1cm}
    {\normalsize Fecha: """ + today + r""" \par}
    \vfill
\end{titlepage}

%% ═══════════════ CONFIGURACIÓN DEL AGENTE ═══════════════
\section{Configuración del Agente}

El agente \textbf{""" + e_agente + r"""} fue evaluado utilizando el modelo
\textbf{""" + e_modelo + r"""}. A continuación se detallan los parámetros
de configuración con los que se realizó la prueba.

\subsection{Instrucciones del sistema}

Las instrucciones proporcionadas al agente fueron las siguientes:

\vspace{0.4em}
""" + e_instruc + r"""

\subsection{Base de conocimiento}

El agente tuvo acceso a los siguientes documentos o recursos como base de
conocimiento:

\vspace{0.3em}
\quad \textbf{""" + e_kbase + r"""}

\subsection{Parámetros adicionales}

\renewcommand{\arraystretch}{1.35}
\begin{center}
\begin{tabularx}{0.85\textwidth}{l X}
\toprule
\textcolor{profublue}{\textbf{Parámetro}} &
\textcolor{profublue}{\textbf{Valor}} \\
\midrule
Búsqueda web       & """ + busq_web.capitalize() + r""" \\
Conocimiento general & """ + conoc_gen.capitalize() + r""" \\
Orquestación        & """ + (e_orq if e_orq else "---") + r""" \\
Herramientas        & """ + (e_herr if e_herr else "---") + r""" \\
\bottomrule
\end{tabularx}
\end{center}

""" + criterios_tex + r"""

""" + pruebas_tex + r"""

""" + kpis_tex + r"""

%% ═══════════════ CONVERSACIÓN DE PRUEBA ═══════════════
\newpage
\section{Conversación de prueba}

A continuación se presentan las preguntas realizadas por el evaluador y las
respuestas generadas por el agente durante la sesión de prueba, junto con
los resultados de la evaluación automatizada cuando estén disponibles.

""" + conv_tex + r"""

\vspace{2em}
{\color{profugold}\rule{\textwidth}{1.5pt}}

\begin{center}
\textit{Fin del reporte de evaluación.}
\end{center}

\end{document}
"""
    return latex


# ──────────────────────────────────────────────────────────────────────
# 6. COMPILACIÓN LaTeX → PDF  (ytotech API)
# ──────────────────────────────────────────────────────────────────────

YTOTECH_URL = "https://latex.ytotech.com/builds/sync"


def resolve_input_folder(project_dir: str, input_folder_arg: str | None) -> tuple[str, str]:
    if input_folder_arg:
        candidate = (
            input_folder_arg
            if os.path.isabs(input_folder_arg)
            else os.path.join(project_dir, input_folder_arg)
        )
        if not os.path.isdir(candidate):
            raise FileNotFoundError(f"No existe el input folder: {candidate}")
        input_dir = os.path.abspath(candidate)
    else:
        candidates = sorted(
            d for d in os.listdir(project_dir)
            if d.startswith("input_") and os.path.isdir(os.path.join(project_dir, d))
        )
        if not candidates:
            raise FileNotFoundError(
                "No se encontró ningún input folder con formato 'input_<BOTNAME>'."
            )
        if len(candidates) > 1:
            raise RuntimeError(
                "Se detectaron varios input folders. Especifica uno por argumento.\n"
                f"Detectados: {', '.join(candidates)}"
            )
        input_dir = os.path.abspath(os.path.join(project_dir, candidates[0]))

    folder_name = os.path.basename(os.path.normpath(input_dir))
    if not folder_name.startswith("input_") or len(folder_name) <= len("input_"):
        raise RuntimeError(
            f"Nombre de input inválido: '{folder_name}'. Usa formato input_<BOTNAME>."
        )
    bot_name = folder_name[len("input_"):]
    return input_dir, bot_name


def _sanitize_filename(name: str) -> str:
    """Normaliza un string para usarlo como parte de un nombre de archivo."""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_only = nfkd.encode("ascii", "ignore").decode("ascii")
    safe = re.sub(r"[^\w\s-]", "", ascii_only).strip()
    return re.sub(r"[\s]+", "_", safe)


def compile_to_pdf(latex_source: str) -> bytes:
    """Envía el LaTeX a ytotech y devuelve el PDF en bytes."""
    payload = {
        "compiler": "pdflatex",
        "resources": [
            {
                "main": True,
                "content": latex_source,
            }
        ],
    }
    resp = requests.post(
        YTOTECH_URL,
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(
            f"Error al compilar LaTeX (HTTP {resp.status_code}): "
            f"{resp.text[:500]}"
        )
    return resp.content


def compile_locally(tex_path: str, output_dir: str) -> str:
    """Compila con pdflatex local y devuelve la ruta del PDF."""
    if not shutil.which("pdflatex"):
        raise RuntimeError(
            "No se encontró 'pdflatex' en PATH. "
            "Instala TeX Live/MiKTeX o compila manualmente."
        )

    cmd = [
        "pdflatex",
        "-interaction=nonstopmode",
        "-halt-on-error",
        f"-output-directory={output_dir}",
        tex_path,
    ]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
        check=False,
    )
    pdf_path = os.path.join(
        output_dir, f"{os.path.splitext(os.path.basename(tex_path))[0]}.pdf"
    )
    if proc.returncode != 0 or not os.path.exists(pdf_path):
        snippet = ((proc.stdout or "") + "\n" + (proc.stderr or ""))[-1000:]
        raise RuntimeError(f"pdflatex falló. Salida reciente:\n{snippet}")
    return pdf_path


# ──────────────────────────────────────────────────────────────────────
# 7. MAIN
# ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) >= 2:
        project_dir = sys.argv[1]
    else:
        project_dir = "."
    project_dir = os.path.abspath(project_dir)

    input_folder_arg = sys.argv[2] if len(sys.argv) >= 3 else None
    input_dir, bot_name = resolve_input_folder(project_dir, input_folder_arg)

    # Leer metadatos e instrucciones
    info = parse_info(input_dir, bot_name)

    # Leer datos de evaluación del Excel / CSV
    rows = read_data_file(input_dir, bot_name)
    print(f"[OK] Se leyeron {len(rows)} filas de evaluación.")
    print(f"[OK] Input folder en uso: {input_dir}")

    # Generar LaTeX
    tex = build_latex(info, rows)

    # Crear carpeta output
    output_dir = os.path.join(project_dir, "output")
    os.makedirs(output_dir, exist_ok=True)

    bot_name = _sanitize_filename(info["agente"])
    eval_name = _sanitize_filename(info["evaluador"])
    base_name = f"{bot_name}_{eval_name}_evaluaciones"

    # Guardar .tex
    tex_path = os.path.join(output_dir, f"{base_name}.tex")
    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(tex)
    print(f"[OK] Archivo .tex generado: {tex_path}")

    # Compilar a PDF
    try:
        print("  Compilando PDF via ytotech ...")
        pdf_bytes = compile_to_pdf(tex)
        pdf_path = os.path.join(output_dir, f"{base_name}.pdf")
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)
        print(f"[OK] PDF generado: {pdf_path}")
    except Exception as e:
        print(f"[WARN] No se pudo compilar a PDF via API: {e}")
        print("       Intentando compilación local con pdflatex ...")
        try:
            local_pdf = compile_locally(tex_path, output_dir)
            print(f"[OK] PDF generado localmente: {local_pdf}")
        except Exception as local_e:
            print(_to_console_safe(f"[WARN] Tampoco se pudo compilar localmente: {local_e}"))
            print("       El archivo .tex está disponible para compilación manual.")

    print(f"  Evaluador : {info['evaluador']}")
    print(f"  Agente    : {info['agente']}")
    print(f"  Modelo    : {info['modelo']}")
    print(f"  Filas     : {len(rows)}")


if __name__ == "__main__":
    main()