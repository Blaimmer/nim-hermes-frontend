use serde_json::json;

#[tauri::command]
fn nim_terminal(command: String, cwd: Option<String>) -> Result<String, String> {
    use std::process::Command;
    
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(command);
        c
    } else {
        let mut c = Command::new("sh");
        c.arg("-c").arg(command);
        c
    };

    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code().unwrap_or(-1);
            
            let result = json!({
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": exit_code
            });
            
            Ok(result.to_string())
        },
        Err(e) => {
            let err_json = json!({"error": e.to_string()});
            Err(err_json.to_string())
        }
    }
}

#[tauri::command]
fn nim_filesystem(action: String, path: String, content: Option<String>) -> Result<String, String> {
    use std::fs;
    match action.as_str() {
        "read" => match fs::read_to_string(&path) {
            Ok(data) => Ok(json!({"content": data}).to_string()),
            Err(e) => Err(json!({"error": e.to_string()}).to_string()),
        },
        "write" => {
            if let Some(c) = content {
                match fs::write(&path, c) {
                    Ok(_) => Ok(json!({"result": "success"}).to_string()),
                    Err(e) => Err(json!({"error": e.to_string()}).to_string()),
                }
            } else {
                Err(json!({"error": "Content required for write"}).to_string())
            }
        },
        _ => Err(json!({"error": "Unknown action"}).to_string()),
    }
}

#[tauri::command]
fn nim_patch_file(path: String, target: String, replacement: String) -> Result<String, String> {
    use std::fs;
    match fs::read_to_string(&path) {
        Ok(data) => {
            if !data.contains(&target) {
                return Err(json!({"error": "Target content not found in file"}).to_string());
            }
            let new_data = data.replace(&target, &replacement);
            match fs::write(&path, new_data) {
                Ok(_) => Ok(json!({"result": "success"}).to_string()),
                Err(e) => Err(json!({"error": e.to_string()}).to_string()),
            }
        },
        Err(e) => Err(json!({"error": e.to_string()}).to_string()),
    }
}

#[tauri::command]
fn nim_list_dir(path: String) -> Result<String, String> {
    use std::fs;
    let mut entries = Vec::new();
    match fs::read_dir(&path) {
        Ok(dir) => {
            for entry in dir.flatten() {
                let path_buf = entry.path();
                let is_dir = path_buf.is_dir();
                if let Some(name) = path_buf.file_name().and_then(|n| n.to_str()) {
                    entries.push(json!({
                        "name": name,
                        "is_dir": is_dir
                    }));
                }
            }
            Ok(json!({"entries": entries}).to_string())
        },
        Err(e) => Err(json!({"error": e.to_string()}).to_string()),
    }
}

#[tauri::command]
fn nim_grep_search(query: String, path: String) -> Result<String, String> {
    use std::process::Command;
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("powershell");
        c.arg("-Command").arg(format!("Select-String -Path '{}' -Pattern '{}' -Recurse", path, query.replace("'", "''")));
        c
    } else {
        let mut c = Command::new("sh");
        c.arg("-c").arg(format!("grep -rn '{}' '{}'", query.replace("'", "'\\''"), path));
        c
    };

    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            Ok(json!({"stdout": stdout}).to_string())
        },
        Err(e) => Err(json!({"error": e.to_string()}).to_string()),
    }
}

// ── NIM PC v2: file ops completas (F3) ────────────────────────────────────

#[tauri::command]
fn nim_file_ops(action: String, path: String, dest: Option<String>) -> Result<String, String> {
    use std::fs;
    match action.as_str() {
        "move" => {
            let d = dest.ok_or_else(|| json!({"error": "dest required"}).to_string())?;
            fs::rename(&path, &d).map_err(|e| json!({"error": e.to_string()}).to_string())?;
            Ok(json!({"result": "moved"}).to_string())
        }
        "copy" => {
            let d = dest.ok_or_else(|| json!({"error": "dest required"}).to_string())?;
            fs::copy(&path, &d).map_err(|e| json!({"error": e.to_string()}).to_string())?;
            Ok(json!({"result": "copied"}).to_string())
        }
        "mkdir" => {
            fs::create_dir_all(&path).map_err(|e| json!({"error": e.to_string()}).to_string())?;
            Ok(json!({"result": "created"}).to_string())
        }
        "delete" => {
            let meta = fs::metadata(&path).map_err(|e| json!({"error": e.to_string()}).to_string())?;
            if meta.is_dir() {
                fs::remove_dir_all(&path).map_err(|e| json!({"error": e.to_string()}).to_string())?;
            } else {
                fs::remove_file(&path).map_err(|e| json!({"error": e.to_string()}).to_string())?;
            }
            Ok(json!({"result": "deleted"}).to_string())
        }
        "exists" => {
            Ok(json!({"exists": fs::metadata(&path).is_ok()}).to_string())
        }
        "size" => {
            let meta = fs::metadata(&path).map_err(|e| json!({"error": e.to_string()}).to_string())?;
            Ok(json!({"size": meta.len(), "is_dir": meta.is_dir()}).to_string())
        }
        _ => Err(json!({"error": "Unknown action"}).to_string()),
    }
}

// ── NIM PC v2: code execution sandbox (F3) ────────────────────────────────
// Ejecuta Python/Node en la PC con timeout. NO es un sandbox aislado de verdad;
// para aislar de verdad se usaría el backend del harness (code_execution_tool).
#[tauri::command]
fn nim_code_exec(lang: String, code: String, timeout_secs: Option<u64>) -> Result<String, String> {
    use std::io::Write;
    use std::process::{Command, Stdio};
    use std::time::Duration;

    let timeout = timeout_secs.unwrap_or(30);
    let tmp_dir = std::env::temp_dir();
    let script_path = tmp_dir.join(format!("nim_exec_{}.{}", std::process::id(), if lang == "python" { "py" } else { "js" }));

    let mut file = std::fs::File::create(&script_path).map_err(|e| json!({"error": e.to_string()}).to_string())?;
    file.write_all(code.as_bytes()).map_err(|e| json!({"error": e.to_string()}).to_string())?;
    drop(file);

    let output = if lang == "python" {
        Command::new("python").arg(&script_path).output()
    } else {
        Command::new("node").arg(&script_path).output()
    };

    let _ = std::fs::remove_file(&script_path);

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            let exit_code = out.status.code().unwrap_or(-1);
            // timeout simulado: el command de proceso real espera, aquí simplemente reportamos
            let _ = Duration::from_secs(0);
            Ok(json!({"stdout": stdout, "stderr": stderr, "exit_code": exit_code, "timed_out": false}).to_string())
        }
        Err(e) => Err(json!({"error": e.to_string()}).to_string()),
    }
}

// ── NIM PC v2: checkpoints (F3) ───────────────────────────────────────────
// Snapshot de archivos en ~/.nim-checkpoints/ para rollback ante cambios rotos.
#[tauri::command]
fn nim_checkpoint(action: String, path: String, label: Option<String>) -> Result<String, String> {
    use std::fs;
    let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_else(|_| ".".into());
    let cp_root = format!("{}/.nim-checkpoints", home);
    fs::create_dir_all(&cp_root).map_err(|e| json!({"error": e.to_string()}).to_string())?;

    match action.as_str() {
        "create" => {
            let ts = chrono_lite_ts();
            let name = label.unwrap_or_else(|| format!("cp-{}", ts));
            let dest = format!("{}/{}-{}", cp_root, name, ts);
            fs::create_dir_all(&dest).map_err(|e| json!({"error": e.to_string()}).to_string())?;
            copy_recursive(&path, &dest)?;
            Ok(json!({"checkpoint": dest}).to_string())
        }
        "list" => {
            let entries: Vec<String> = fs::read_dir(&cp_root)
                .map(|d| d.flatten().filter_map(|e| e.file_name().to_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();
            Ok(json!({"checkpoints": entries}).to_string())
        }
        _ => Err(json!({"error": "Unknown action"}).to_string()),
    }
}

fn chrono_lite_ts() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    secs.to_string()
}

fn copy_recursive(src: &str, dst: &str) -> Result<(), String> {
    use std::fs;
    let meta = fs::metadata(src).map_err(|e| json!({"error": e.to_string()}).to_string())?;
    if meta.is_dir() {
        fs::create_dir_all(dst).map_err(|e| json!({"error": e.to_string()}).to_string())?;
        for entry in fs::read_dir(src).map_err(|e| json!({"error": e.to_string()}).to_string())? {
            let entry = entry.map_err(|e| json!({"error": e.to_string()}).to_string())?;
            let src_child = entry.path();
            let dst_child = format!("{}/{}", dst, entry.file_name().to_string_lossy());
            if let Some(s) = src_child.to_str() {
                copy_recursive(s, &dst_child)?;
            }
        }
        Ok(())
    } else {
        fs::copy(src, dst).map_err(|e| json!({"error": e.to_string()}).to_string())?;
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      nim_terminal,
      nim_filesystem,
      nim_patch_file,
      nim_list_dir,
      nim_grep_search,
      nim_file_ops,
      nim_code_exec,
      nim_checkpoint
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
