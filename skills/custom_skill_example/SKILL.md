---
name: "custom_skill_example"
description: "Módulo demo de extracción, clasificación y enriquecimiento semántico corporativo de datos de NIM."
version: "1.0.0"
author: "NIM Core"
---

# NIM Agent Skill: Custom Semantic Classifier

Este módulo de habilidad permite clasificar cadenas de datos entrantes según categorías de negocios predeterminadas, utilizando pesos TF-IDF adaptados localmente.

## 1. Declaración de Skill
- **Estructura Estándar v2026**: Las habilidades deben ser modulares, autocontenidas y declaradas mediante YAML encabezado para precarga ligera.
- **Acciones Permitidas**:
  - `classify_text`: Clasifica un texto en función de las taxonomías de negocio cargadas en memoria.

## 2. Parámetros de Operación
Para invocar esta skill dentro del motor agéntico NIM, emita un `agent_action` con:
```json
{
  "tool_name": "custom_skill_example",
  "parameters": {
    "action": "classify_text",
    "text": "Cadena de texto corporativa a clasificar"
  }
}
```

## 3. Comportamiento en Casos de Excepción
- Si el texto está vacío, devuelva un vector nulo con un código de observación de estado `EMPTY_PAYLOAD`.
- Si se detecta un patrón desconocido, asigne la categoría predeterminada `GENERAL_KNOWLEDGE`.
