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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![nim_terminal, nim_filesystem, nim_patch_file, nim_list_dir, nim_grep_search])
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
