use tauri_plugin_dialog::DialogExt;

/// Export: Rust öffnet selbst den „Sichern unter …"-Dialog und schreibt nur an den Ort,
/// den man dort gewählt hat. Die Seite kann also keinen Pfad vorgeben — auch eingeschleuster
/// Code im Fenster könnte so keine beliebigen Dateien überschreiben.
/// Liefert `false`, wenn der Dialog abgebrochen wurde.
#[tauri::command]
async fn exportieren(app: tauri::AppHandle, dateiname: String, inhalt: String) -> Result<bool, String> {
  let Some(ziel) = app
    .dialog()
    .file()
    .set_file_name(&dateiname)
    .add_filter("JSON", &["json"])
    .blocking_save_file()
  else {
    return Ok(false);
  };
  let pfad = ziel.into_path().map_err(|e| e.to_string())?;
  std::fs::write(&pfad, inhalt).map_err(|e| format!("{}: {e}", pfad.display()))?;
  Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![exportieren])
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
    .expect("error while building tauri application");
}
