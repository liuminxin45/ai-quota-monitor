use anyhow::{Context, Result};

#[cfg(windows)]
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

const RUN_KEY_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_VALUE_NAME: &str = "AI Monitor Tray";

pub fn is_enabled() -> Result<bool> {
    #[cfg(windows)]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run_key = hkcu.open_subkey(RUN_KEY_PATH).context("failed to open startup key")?;
        let current_exe = format_command()?;
        let current_value: String = run_key.get_value(RUN_VALUE_NAME).unwrap_or_default();
        return Ok(current_value == current_exe);
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
            run_key
                .set_value(RUN_VALUE_NAME, &format_command()?)
                .context("failed to enable startup")?;
        } else {
            let _ = run_key.delete_value(RUN_VALUE_NAME);
        }

        return is_enabled();
    }

    #[allow(unreachable_code)]
    Ok(false)
}

#[cfg(windows)]
fn format_command() -> Result<String> {
    let current_exe = std::env::current_exe().context("failed to resolve current exe")?;
    Ok(format!("\"{}\"", current_exe.display()))
}
