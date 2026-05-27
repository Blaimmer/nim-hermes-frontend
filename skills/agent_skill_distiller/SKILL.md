---
name: "agent_skill_distiller"
description: "Módulo agéntico de auto-evolución y destilación de habilidades. Escanea, comprende y adapta habilidades y plugins de terceros (Claude Code, Antigravity SDK, OpenClaw) a la matriz modular de NIM."
version: "1.0.0"
author: "NIM Auto-Evolution System"
---

# NIM Agent Skill: Agent Skill Distiller (Destilador de Habilidades)

Este módulo dota a NIM de la capacidad proactiva de asimilar, reescribir y auto-compilar habilidades procedentes de plataformas agénticas externas, adaptando su sintaxis, directivas de sistema y parámetros al motor lógico nativo de NIM.

## 1. Directivas de Escaneo y Análisis
NIM buscará en las rutas del sistema host archivos `SKILL.md`, `plugin.json` o configuraciones de herramientas en suites agénticas como Claude Code, Antigravity SDK y OpenClaw.

Al localizar una habilidad, NIM aplicará los siguientes pasos lógicos:
1. **Extracción del Frontmatter**: Extraer el nombre, versión y descripción del plugin externo.
2. **Traducción Cognitiva**: Traducir las instrucciones del idioma de origen al español refinado y formal de NIM, manteniendo el trato formal ("Señor").
3. **Mapeo de Parámetros**: Re-mapear los llamados de herramientas de Python/Node externos a objetos JSON planos procesables en el bucle cerrado ReAct de NIM (`agent_action`).
4. **Auto-Compilación Directa**: Guardar de forma autónoma la habilidad adaptada en `/skills/[id]/SKILL.md` usando la herramienta `create_skill`.

## 2. Parámetros de Operación
Para forzar a NIM a destilar una habilidad externa desde una ruta local del host, emita un `agent_action` con este formato:
```json
{
  "tool_name": "create_skill",
  "parameters": {
    "skill_id": "nombre_corto_en_minuscula",
    "skill_name": "NOMBRE FORMAL DE LA HABILIDAD",
    "description": "Descripción formal detallando su origen adaptado",
    "instructions": "# Habilidad Adaptada: [Nombre]\n\n## 1. Directivas de Operación\n..."
  }
}
```

## 3. Protocolo de Autonomía y Proactividad
- Si el Señor menciona una habilidad de Claude Code o Antigravity, NIM buscará proactivamente la ruta del plugin en el sistema (por ejemplo, en `C:\Users\user\.gemini\config\plugins\`), leerá su código fuente o su documentación usando `console_run` (ej: `type C:\path\to\SKILL.md`), la analizará, y propondrá de inmediato auto-compilarla e inyectarla en su HUD.
- Tras la inyección, NIM informará diplomáticamente al Señor de que su base lógica ha evolucionado y que el nuevo canal está sintonizado y listo para recibir órdenes.
