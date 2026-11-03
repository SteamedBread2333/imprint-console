use std::fs;
use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::config::AppConfig;
use crate::imprint::{run_imprint_capture, run_imprint_json};

pub fn project_cwd(cfg: &AppConfig) -> Result<PathBuf, String> {
    if cfg.project_root.trim().is_empty() {
        return Err("select a project first".into());
    }
    Ok(PathBuf::from(cfg.project_root.trim()))
}

/// macOS save/open panels reuse the last folder when unset — often embed-sidecar after runtime jobs.
fn default_dialog_directory(project_root: &Path, export_file: &Path) -> PathBuf {
    if project_root.is_dir() {
        return project_root.to_path_buf();
    }
    if let Some(parent) = export_file.parent() {
        if parent.is_dir() {
            return parent.to_path_buf();
        }
    }
    std::env::var_os("HOME")
        .map(|h| PathBuf::from(h).join("Downloads"))
        .filter(|p| p.is_dir())
        .unwrap_or_else(|| project_root.to_path_buf())
}

pub fn parse_export_wrote_path(output: &str) -> Option<PathBuf> {
    for line in output.lines() {
        let trimmed = line.trim();
        if let Some(idx) = trimmed.find("wrote ") {
            let path = trimmed[idx + 6..].trim();
            if !path.is_empty() {
                return Some(PathBuf::from(path));
            }
        }
    }
    None
}

fn run_export(cfg: &AppConfig, cwd: &Path, format: &str) -> Result<PathBuf, String> {
    if format != "json" && format != "jsonl" {
        return Err("format must be json or jsonl".into());
    }
    let (code, stdout, stderr) =
        run_imprint_capture(cfg, cwd, &["export", "--format", format])?;
    let combined = format!("{stdout}\n{stderr}");
    if code != 0 {
        let msg = if stderr.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            stderr.trim().to_string()
        };
        return Err(if msg.is_empty() {
            format!("imprint export exited with code {code}")
        } else {
            msg
        });
    }
    parse_export_wrote_path(&combined).ok_or_else(|| {
        format!("imprint export succeeded but wrote path was not found in output:\n{combined}")
    })
}

pub fn export_vault_with_save_dialog(
    app: &AppHandle,
    cfg: &AppConfig,
    format: &str,
    title: &str,
) -> Result<Option<String>, String> {
    let cwd = project_cwd(cfg)?;
    let source = run_export(cfg, &cwd, format)?;
    let default_name = if format == "jsonl" {
        "vault.jsonl"
    } else {
        "vault.json"
    };
    let dialog_dir = default_dialog_directory(&cwd, &source);
    let dest = app
        .dialog()
        .file()
        .set_title(title)
        .set_directory(&dialog_dir)
        .set_file_name(default_name)
        .add_filter("Imprint vault export", &["json", "jsonl"])
        .blocking_save_file();
    let Some(dest) = dest else {
        return Ok(None);
    };
    let dest_path = PathBuf::from(dest.to_string());
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(&source, &dest_path).map_err(|e| format!("copy export to destination: {e}"))?;
    Ok(Some(dest_path.to_string_lossy().into_owned()))
}

pub fn import_vault_from_path(cfg: &AppConfig, file_path: &str) -> Result<String, String> {
    let path = file_path.trim();
    if path.is_empty() {
        return Err("import path is empty".into());
    }
    if !Path::new(path).is_file() {
        return Err(format!("file not found: {path}"));
    }
    let cwd = project_cwd(cfg)?;
    let v = run_imprint_json(cfg, &cwd, &["import", path])?;
    Ok(v.to_string())
}

pub fn clear_vault(cfg: &AppConfig) -> Result<String, String> {
    let cwd = project_cwd(cfg)?;
    let (code, stdout, stderr) =
        run_imprint_capture(cfg, &cwd, &["clear", "--confirm", "--yes"])?;
    let mut msg = stdout.trim().to_string();
    let err = stderr.trim();
    if !err.is_empty() {
        if !msg.is_empty() {
            msg.push('\n');
        }
        msg.push_str(err);
    }
    if code != 0 {
        return Err(if msg.is_empty() {
            format!("imprint clear exited with code {code}")
        } else {
            msg
        });
    }
    Ok(if msg.is_empty() {
        "clear completed".into()
    } else {
        msg
    })
}

pub fn pick_import_file(
    app: &AppHandle,
    cfg: &AppConfig,
    title: &str,
) -> Result<Option<String>, String> {
    let project = project_cwd(cfg)?;
    let start_dir = if project.is_dir() {
        project
    } else {
        std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join("Downloads"))
            .unwrap_or(project)
    };
    let path = app
        .dialog()
        .file()
        .set_title(title)
        .set_directory(&start_dir)
        .add_filter("Imprint vault export", &["json", "jsonl"])
        .blocking_pick_file();
    Ok(path.map(|p| p.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_wrote_path_from_cli_output() {
        let sample = "  export\n  ──\n\n  ✓  wrote /tmp/vault.jsonl\n";
        assert_eq!(
            parse_export_wrote_path(sample),
            Some(PathBuf::from("/tmp/vault.jsonl"))
        );
    }
}
