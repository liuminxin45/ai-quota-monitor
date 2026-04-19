use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

#[cfg(windows)]
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

const RUN_KEY_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_VALUE_NAME: &str = "AI Monitor Tray";
const STARTUP_SCRIPT_NAME: &str = "launch-at-login.cmd";

pub fn is_enabled() -> Result<bool> {
    #[cfg(windows)]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let expected_run_value = format_run_command()?;
        let current_value = hkcu
            .open_subkey(RUN_KEY_PATH)
            .ok()
            .and_then(|run_key| run_key.get_value::<String, _>(RUN_VALUE_NAME).ok())
            .unwrap_or_default();
        let startup_script_exists = launcher_script_path()?.exists();
        return Ok(current_value == expected_run_value && startup_script_exists);
    }

    #[allow(unreachable_code)]
    Ok(false)
}

pub fn set_enabled(enabled: bool) -> Result<bool> {
    #[cfg(windows)]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (run_key, _) = hkcu
            .create_subkey(RUN_KEY_PATH)
            .context("failed to create startup key")?;

        if enabled {
            write_startup_script()?;
            run_key
                .set_value(RUN_VALUE_NAME, &format_run_command()?)
                .context("failed to enable startup")?;
        } else {
            let _ = run_key.delete_value(RUN_VALUE_NAME);
            let _ = remove_startup_script();
        }

        return is_enabled();
    }

    #[allow(unreachable_code)]
    Ok(false)
}

#[cfg(windows)]
fn format_run_command() -> Result<String> {
    let script = launcher_script_path()?;
    Ok(format!("\"{}\"", script.display()))
}

#[cfg(windows)]
fn launcher_script_path() -> Result<PathBuf> {
    let launcher_dir = dirs::data_local_dir()
        .context("failed to resolve LocalAppData")?
        .join("AI Monitor")
        .join("tray");
    Ok(launcher_dir.join(STARTUP_SCRIPT_NAME))
}

#[cfg(windows)]
fn write_startup_script() -> Result<()> {
    let current_exe = std::env::current_exe().context("failed to resolve current exe")?;
    let exe_dir = current_exe
        .parent()
        .context("failed to resolve exe directory")?;
    let script_path = launcher_script_path()?;
    if let Some(parent) = script_path.parent() {
        fs::create_dir_all(parent).context("failed to create launcher directory")?;
    }
    let script_content = format!(
        "@echo off\r\ncd /d \"{}\"\r\nstart \"\" \"{}\"\r\n",
        exe_dir.display(),
        current_exe.display()
    );
    fs::write(&script_path, script_content).context("failed to write startup script")?;
    Ok(())
}

#[cfg(windows)]
fn remove_startup_script() -> Result<()> {
    let script_path = launcher_script_path()?;
    if script_path.exists() {
        fs::remove_file(script_path).context("failed to remove startup script")?;
    }
    Ok(())
}
