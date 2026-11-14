/// Schreibt die Export-Datei an den Ort, den man im „Sichern unter …"-Dialog gewählt hat.
/// Der Pfad kommt immer aus diesem nativen Dialog (siehe `web/js/native.js`).
#[tauri::command]
fn datei_schreiben(pfad: String, inhalt: String) -> Result<(), String> {
  std::fs::write(&pfad, inhalt).map_err(|e| format!("{pfad}: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![datei_schreiben])
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
