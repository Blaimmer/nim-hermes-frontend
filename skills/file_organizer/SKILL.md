---
name: "file_organizer"
description: "Organizador de Archivos local físico de NIM. Agrupa y clasifica de forma real todos los archivos de un directorio desorganizado (como Descargas o Documentos) en carpetas categorizadas por su tipo de archivo."
version: "1.0.0"
author: "NIM Core"
---

# NIM Agent Skill: File Organizer (Organizador de Archivos)

Este módulo de habilidad dota a NIM de la capacidad física de organizar directorios desordenados en el disco del host del Creador, agrupando de forma segura los archivos en subcarpetas categorizadas según su tipo de extensión.

## 1. Categorización de Archivos
NIM agrupa los archivos en las siguientes carpetas estables:
- **Documentos**: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.txt`, `.rtf`, `.csv`
- **Imágenes**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp`
- **Videos**: `.mp4`, `.mkv`, `.avi`, `.mov`, `.flv`, `.wmv`
- **Audio**: `.mp3`, `.wav`, `.aac`, `.flac`, `.ogg`
- **Comprimidos**: `.zip`, `.rar`, `.7z`, `.tar`, `.gz`
- **Ejecutables**: `.exe`, `.msi`, `.bat`, `.cmd`
- **Código y Datos**: `.json`, `.xml`, `.html`, `.htm`, `.css`, `.js`, `.ts`
- **Otros**: Archivos con extensiones no identificadas.

## 2. Parámetros de Operación
Para ordenar de forma física un directorio del host, emita un `agent_action` con este formato:
```json
{
  "tool_name": "file_organizer",
  "parameters": {
    "directory": "C:\\Users\\user\\Downloads"
  }
}
```

## 3. Seguridad y Protocolos de Respaldo
- **Preservación**: Solo se mueven archivos individuales en la raíz del directorio especificado.
- **Ignorar**: No se procesan carpetas ya existentes, evitando recursiones accidentales.
- **Colisiones**: Si un archivo de destino ya existe en la subcarpeta, NIM añade un sufijo único (ej: `_1`) para evitar la sobreescritura accidental de datos.
- **Reporte**: Devuelve un informe con la cantidad de archivos organizados y las categorías creadas.
