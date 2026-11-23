# Aether Tactile Studio — Roadmapa Akustyki Przestrzennej 3D i Interakcji

Zapisano na prośbę użytkownika (`2026-11-22`):

## 1. Dźwięk kierunkowy / przestrzenny dla modeli 3D (Priorytet)
- **Web Audio `StereoPannerNode` + `PannerNode` (HRTF 3D):** dynamiczne przesuwanie dźwięku między lewym a prawym głośnikiem telefonu/tabletu zgodnie z pozycją palca (`X/Y`), kątem obrotu sfery 3D oraz kierunkiem kręcenia pokrętła CNC 270°.
- **Natywny iOS (`AVAudioEnvironmentNode` w `.swiftpm`):** pełne pozycjonowanie 3D źródeł dźwięku w przestrzeni względem urządzenia.
- **Efekt fizyczny:** dotknięcie lewej krawędzi kuli / ekranu odzywa się z lewego głośnika, prawej — z prawego, a przeciągnięcie przez środek płynnie przenosi falę akustyczną przez oba głośniki stereo.

## 2. Interakcja między dźwiękami i wieloma urządzeniami
- Łączenie warstw akustycznych (np. pik szkła + wybrzmienie cymbałek + lepkość żelu) oraz testy sterowania pobliskimi urządzeniami Apple (np. akcja na tablecie wywołująca odpowiedź haptyczno-akustyczną na telefonie).
- Zachowanie zasad z `audiophile_design_tokens.json`: ultrapłaskie przyciski (zero poduszek), minimalna poświata po kliknięciu, logarytmiczne skale częstotliwości i czasu.
