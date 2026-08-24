use serde_json::json;

// ── Helper: ejecutar un comando con timeout y kill ─────────────────────────
// Los commands de Tauri que ejecutan procesos DEBEN pasar por aquí: corren en
// spawn_blocking (no bloquean el hilo principal/UI) y matan el proceso si no
// termina dentro del límite (evita que la app se congele/cuelgue con cmd /C
// interactivo o procesos zombies). Patrón alineado con el harness de Hermes
// Agent (tools/terminal_tool.py) que SIEMPRE ejecuta con timeout.
fn run_cmd_with_timeout(
    mut cmd: std::process::Command,
    timeout_secs: u64,
) -> Result<String, String> {
    use std::io::Read;
    use std::process::Stdio;
    use std::time::{Duration, Instant};

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return Err(json!({"error": e.to_string()}).to_string()),
    };

    let deadline = Instant::now() + Duration::from_secs(timeout_secs.max(1));
    let status = loop {
        match child.try_wait() {
            Ok(Some(st)) => break st,
            Ok(None) => {
                if Instant::now() > deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(json!({
                        "error": format!("timeout: el comando no terminó en {}s", timeout_secs),
                        "timed_out": true
                    }).to_string());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(json!({"error": e.to_string()}).to_string()),
        }
    };

    let mut stdout = String::new();
    let mut stderr = String::new();
    if let Some(mut so) = child.stdout.take() {
        let _ = so.read_to_string(&mut stdout);
    }
    if let Some(mut se) = child.stderr.take() {
        let _ = se.read_to_string(&mut stderr);
    }
    let exit_code = status.code().unwrap_or(-1);
    Ok(json!({"stdout": stdout, "stderr": stderr, "exit_code": exit_code}).to_string())
}

#[tauri::command]
async fn nim_terminal(command: String, cwd: Option<String>) -> Result<String, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = std::process::Command::new("cmd");
            c.arg("/C").arg(&command);
            c
        } else {
            let mut c = std::process::Command::new("sh");
            c.arg("-c").arg(&command);
            c
        };
        if let Some(dir) = cwd {
            if !dir.is_empty() {
                cmd.current_dir(&dir);
            }
        }
        run_cmd_with_timeout(cmd, 20)
    });
    result.await.map_err(|e| e.to_string())?
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
async fn nim_code_exec(lang: String, code: String, timeout_secs: Option<u64>) -> Result<String, String> {
    let timeout = timeout_secs.unwrap_or(30).min(60);
    let result = tauri::async_runtime::spawn_blocking(move || {
        use std::io::Write;

        let tmp_dir = std::env::temp_dir();
        let script_path = tmp_dir.join(format!(
            "nim_exec_{}_{}.{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0),
            if lang == "python" { "py" } else { "js" }
        ));

        let write_result = std::fs::File::create(&script_path)
            .and_then(|mut f| f.write_all(code.as_bytes()));
        if let Err(e) = write_result {
            return Err(json!({"error": e.to_string()}).to_string());
        }

        let mut cmd = if lang == "python" {
            std::process::Command::new("python")
        } else {
            std::process::Command::new("node")
        };
        cmd.arg(&script_path);

        let out = run_cmd_with_timeout(cmd, timeout);
        let _ = std::fs::remove_file(&script_path);
        out
    });
    result.await.map_err(|e| e.to_string())?
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

// ── NIM PC v2: computer use (F3) ──────────────────────────────────────────
// Control de pantalla en Windows vía PowerShell nativo (sin deps Rust extra).
//   screenshot  → PNG en %TEMP%/nim_screen.png (Base64 en el resultado)
//   click       → click en (x, y) usando user32
//   type        → escribe texto con SendKeys
//   move        → mueve el cursor a (x, y)
#[tauri::command]
async fn nim_computer_use(action: String, x: Option<i32>, y: Option<i32>, text: Option<String>) -> Result<String, String> {
    let ps_script = match action.as_str() {
        "screenshot" => r#"
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$path = Join-Path $env:TEMP 'nim_screen.png'
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$bytes = [System.IO.File]::ReadAllBytes($path)
[Convert]::ToBase64String($bytes)
"#.to_string(),
        "click" => {
            let cx = x.unwrap_or(0);
            let cy = y.unwrap_or(0);
            format!(
                "Add-Type -AssemblyName System.Windows.Forms\n\
                 [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point({}, {})\n\
                 $s = New-Object System.Windows.Forms.SendKeys\n\
                 [System.Windows.Forms.SendKeys]::SendWait('{{ENTER}}')\n\
                 'clicked {} {}'",
                cx, cy, cx, cy
            )
        }
        "move" => {
            let cx = x.unwrap_or(0);
            let cy = y.unwrap_or(0);
            format!(
                "Add-Type -AssemblyName System.Windows.Forms\n\
                 [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point({}, {})\n\
                 'moved {} {}'",
                cx, cy, cx, cy
            )
        }
        "type" => {
            let t = text.clone().unwrap_or_default();
            format!(
                "Add-Type -AssemblyName System.Windows.Forms\n\
                 [System.Windows.Forms.SendKeys]::SendWait('{}')\n\
                 'typed'",
                t.replace("'", "''").replace("{", "{{").replace("}", "}}")
            )
        }
        _ => return Err(json!({"error": "Unknown action (screenshot|click|move|type)"}).to_string()),
    };

    let result = tauri::async_runtime::spawn_blocking(move || {
        if !cfg!(target_os = "windows") {
            return Err(json!({"error": "computer_use solo Windows (por ahora)"}).to_string());
        }
        let mut cmd = std::process::Command::new("powershell");
        cmd.arg("-NoProfile").arg("-Command").arg(ps_script);
        run_cmd_with_timeout(cmd, 30)
    });
    result.await.map_err(|e| e.to_string())?
}

// ── NIM PC v2: git review (F2.4) ──────────────────────────────────────────
// Ejecuta git en la PC local vía Command (funciona en Windows con git.exe
// en PATH y en Linux/Mac). Devuelve JSON string con stdout/stderr/exit_code.

fn run_git(args: &[&str], cwd: &str) -> Result<String, String> {
    use std::process::Command;
    let mut cmd = Command::new("git");
    cmd.args(args);
    if !cwd.is_empty() {
        cmd.current_dir(cwd);
    }
    match cmd.output() {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            let exit_code = out.status.code().unwrap_or(-1);
            Ok(json!({"stdout": stdout.trim(), "stderr": stderr.trim(), "exit_code": exit_code}).to_string())
        }
        Err(e) => Err(json!({"error": format!("git no encontrado: {}", e)}).to_string()),
    }
}

#[tauri::command]
fn nim_git_status(cwd: String) -> Result<String, String> {
    // --porcelain=v1 da XY + path por línea; -z no hace falta para UI simple.
    run_git(&["status", "--porcelain=v1", "--branch"], &cwd)
}

#[tauri::command]
fn nim_git_diff(cwd: String, path: Option<String>, staged: Option<bool>) -> Result<String, String> {
    let mut args = vec!["diff"];
    if staged.unwrap_or(false) {
        args.push("--cached");
    }
    if let Some(ref p) = path {
        if !p.is_empty() {
            args.push("--");
            args.push(p.as_str());
        }
    }
    run_git(&args, &cwd)
}

#[tauri::command]
fn nim_git_commit(cwd: String, message: String) -> Result<String, String> {
    let add = run_git(&["add", "-A"], &cwd)?;
    let commit = run_git(&["commit", "-m", &message], &cwd)?;
    // Combinar ambos resultados; si add falló, su stderr ya viene en el JSON.
    let add_json: serde_json::Value = serde_json::from_str(&add).unwrap_or(serde_json::json!({}));
    let commit_json: serde_json::Value = serde_json::from_str(&commit).unwrap_or(serde_json::json!({}));
    Ok(json!({"add": add_json, "commit": commit_json}).to_string())
}

// ── NIM PC v2: Antigravity CLI (F4) ───────────────────────────────────────
// Ejecuta agy (Antigravity CLI) en la PC local en modo no interactivo
// (agy --print 'prompt'). Detecta agy en PATH; si falta, devuelve error claro
// con instrucción de instalación. En Windows agy.exe debe estar en PATH.

#[tauri::command]
async fn nim_antigravity(prompt: String, cwd: Option<String>, timeout_secs: Option<u64>) -> Result<String, String> {
    let timeout = timeout_secs.unwrap_or(60).min(120);
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(if cfg!(target_os = "windows") { "agy.exe" } else { "agy" });
        cmd.arg("--print").arg(&prompt);
        if let Some(dir) = cwd {
            if !dir.is_empty() {
                cmd.current_dir(&dir);
            }
        }
        match run_cmd_with_timeout(cmd, timeout) {
            Ok(out) => Ok(out),
            Err(e) => {
                // agy no encontrado (spawn falla con os error 2 / No such file)
                if e.contains("os error 2") || e.contains("No such file") || e.contains("not found") {
                    Err(json!({"error": "agy no está en PATH. Instálalo con: agy install (o https://antigravity.dev). El panel Antigravity requiere la CLI en la PC."}).to_string())
                } else {
                    Err(e)
                }
            }
        }
    });
    result.await.map_err(|e| e.to_string())?
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
      nim_checkpoint,
      nim_computer_use,
      nim_git_status,
      nim_git_diff,
      nim_git_commit,
      nim_antigravity
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      app.handle().plugin(tauri_plugin_shell::init())?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
