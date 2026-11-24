# Konfigurator 3D

Interaktywny konfigurator produktu w przeglądarce. Wybierasz kształt, kolor i wykończenie, a podgląd 3D i cena zmieniają się od razu. To projekt demonstracyjny: produkty i ceny są przykładowe.

## Funkcje

- Trzy kształty (Wazon, Butelka, Donica) toczone z gładkiego profilu, na obrotowym postumencie z miękkimi cieniami.
- Sześć kolorów z płynnym przejściem barwy i cztery wykończenia: matowe, błyszczące, metaliczne i szklane.
- Cena liczona na żywo z krótkim podsumowaniem konfiguracji.
- Obrót automatyczny z regulacją prędkości, widok siatki, jasne lub ciemne tło (domyślnie według ustawień systemu).
- Zapis podglądu do pliku PNG i link do konfiguracji (stan zapisany w adresie, np. `#vase-2-glass`).
- Obsługa klawiatury, widoczny fokus, `prefers-reduced-motion`, układ na telefon i komunikat, gdy WebGL jest niedostępny.
- Działa w całości offline: bez zewnętrznych czcionek, CDN i analityki.

## Uruchomienie

Wymagany Node.js 20.19 lub nowszy.

```bash
npm install
npm run dev      # serwer deweloperski
npm run build    # sprawdzenie typów i build do folderu docs/
npm run preview  # podgląd zbudowanej wersji
npm test         # testy jednostkowe (Vitest)
```

## Technologie

Three.js (LatheGeometry, PMREM z RoomEnvironment, ACES, OrbitControls), TypeScript, Vite, Vitest. Bez frameworka UI.

## Struktura

- `src/config.ts` – dane produktów, wycena, zapis i odczyt stanu z adresu
- `src/scene.ts` – scena 3D, materiały i oświetlenie
- `src/ui.ts` – panel opcji
- `src/main.ts` – stan aplikacji i połączenie sceny z panelem
- `tests/` – testy logiki

## Licencja

MIT, zobacz [LICENSE](LICENSE).

---

*Interactive 3D product configurator demo (Three.js, TypeScript, Vite) with live pricing and shareable state; sample data only.*
