# Konfigurator 3D · Kolekcja Forma

Interaktywny konfigurator produktu w przeglądarce. Wybierasz model, kolor, wykończenie, rozmiar i dodatki, a podgląd 3D, wymiary i cena zmieniają się płynnie od razu. To projekt demonstracyjny: produkty i ceny są przykładowe.

## Funkcje

**Podgląd 3D**

- Sześć modeli ceramiki (Wazon, Butelka, Donica, Amfora, Misa, Kielich), każdy z własną ceną bazową. Kształty są toczone z profilu, a zmiana modelu to płynna animacja przejścia (morfing profilu punkt po punkcie, bez przeskoku).
- Cztery otoczenia świetlne generowane w kodzie, bez plików HDR: Studio, Galeria, Zachód i Neon. Każde ma własną mapę odbić (PMREM z proceduralnej sceny), światło kluczowe, światła konturowe i dopasowane tło strony.
- Miękkie cienie, cień kontaktowy, odbicia otoczenia, materiały PBR: matowe, połysk, metal i barwione szkło. Kolor i wykończenie przechodzą płynnie (także z i do szkła).
- Widoki kamery z płynnym przejściem: 3/4, przód, góra i zbliżenie na detal. Tryb prezentacji (powolny obrót).
- Tryb „Wymiary”: linie wymiarowe (wysokość, średnica w cm) i opisane moduły produktu (np. stopka, brzusiec, szyjka) z liniami odniesienia, które podążają za kamerą.
- Produkt jest kadrowany w wolnej części ekranu, obok panelu konfiguracji.

**Konfiguracja i cena**

- Kolory (dwa z dopłatą premium), cztery wykończenia, trzy rozmiary (skala modelu i wymiary w cm), dodatki: podstawka dębowa (widoczna w 3D), grawer, opakowanie prezentowe.
- Rozbicie ceny na pozycje, animowana suma i kwota VAT.
- Cofnij i ponów (Ctrl+Z, Ctrl+Y) dla każdej zmiany konfiguracji.
- Zapisywanie konfiguracji z miniaturą (localStorage, do 12 pozycji, odporne na brak lub uszkodzenie pamięci) i porównanie dwóch konfiguracji obok siebie (lub zapisanej z bieżącą) z wyróżnieniem różnic i różnicą ceny.
- Eksport PNG w wysokiej rozdzielczości (do 3200 × 2400), z tłem albo przezroczysty.
- Link do konfiguracji w adresie strony, np. `#shape=vase&color=terakota&finish=glass&size=m&extras=stand&env=neon`. Stare linki w formacie `#vase-2-glass` nadal działają.

**Interfejs**

- Szklane panele zbudowane z półprzezroczystych warstw, gradientowej ramki, wewnętrznego odblasku i delikatnego ziarna; nastrojowe tło z wolno dryfującymi poświatami.
- Jasny i ciemny motyw (domyślnie według systemu, wybór jest zapamiętywany).
- Animacje: panele wchodzą po kolei, ceny liczą się płynnie, wskaźnik wyboru przesuwa się między opcjami, mikrointerakcje przycisków, poświata kursora na panelu. Wszystko respektuje `prefers-reduced-motion`.
- Skróty klawiszowe z listą pod klawiszem `?` (modele 1–6, C, M, R, O, H/F/G/Z, P, W, T, S, E, Ctrl+S).
- Dostępność: prawdziwe przyciski z `aria-pressed`, nawigacja strzałkami w grupach opcji, widoczny fokus, kontrast tekstu co najmniej 4,5:1 w obu motywach, komunikaty dla czytników ekranu, przyjazny komunikat, gdy WebGL jest niedostępny (konfiguracja i cena działają dalej).
- Układ od 360 px do 1920 px: na telefonie podgląd na górze, opcje pod nim i przyklejone podsumowanie ceny.
- Działa w całości offline: bez zewnętrznych czcionek, CDN, plików HDR i analityki.

## Wydajność

- Scena renderuje klatkę tylko wtedy, gdy coś się zmienia (kamera, animacja, konfiguracja); w spoczynku nie ma żadnej pracy GPU.
- Brak alokacji w pętli renderowania: morfing przepisuje bufory geometrii w miejscu, wektory są współdzielone.
- Gęstość pikseli maksymalnie 2, z adaptacją: gdy wygładzony czas klatki przekracza ok. 24 ms, rozdzielczość spada o stopień (do 0,5); po kilku sekundach płynnej pracy wraca. Przy programowym renderowaniu (np. SwiftShader) start od razu z niższej rozdzielczości.
- Cienie są przeliczane tylko po zmianie produktu lub światła, nie przy obracaniu kamery. Szkło (transmission) jest renderowane w połowie rozdzielczości.
- Warianty shaderów (w tym szkła) są przygotowywane przy starcie, zanim podgląd się pojawi, więc pierwsze przełączenie na szkło nie zacina obrazu.
- Bez `backdrop-filter` na panelach; tło animuje tylko `transform` i `opacity` na osobnych warstwach. Karty mają `contain: layout paint`, dolne sekcje panelu `content-visibility: auto`.
- Licznik klatek: dodaj `?fps` do adresu.

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

Three.js (własna geometria toczona z aktualizacją w miejscu, PMREM z proceduralnych scen, Neutral tone mapping, OrbitControls), TypeScript, Vite, Vitest. Bez frameworka UI i bez dodatkowych zależności.

## Struktura

- `src/config.ts` – katalog produktów, wycena z rozbiciem na pozycje, zapis i odczyt stanu z adresu
- `src/profile.ts` – profile kształtów o stałej liczbie punktów, interpolacja (morfing), pomiary
- `src/lathe.ts` – geometria toczona aktualizowana bez alokacji
- `src/scene.ts` – scena 3D, materiały, światła, kamera, eksport obrazu
- `src/environments.ts` – proceduralne otoczenia świetlne i paleta tła
- `src/dimensions.ts` – warstwa wymiarów i opisów modułów
- `src/history.ts` – cofnij i ponów
- `src/storage.ts` – zapisane konfiguracje w localStorage
- `src/shortcuts.ts` – skróty klawiszowe
- `src/quality.ts` – adaptacyjna gęstość pikseli
- `src/ui.ts`, `src/dialogs.ts`, `src/main.ts` – panel, okna dialogowe i stan aplikacji
- `tests/` – testy logiki (wycena, adres, historia, zapis, morfing, animacje, skróty, jakość)

## Licencja

MIT, zobacz [LICENSE](LICENSE).

---

*Interactive 3D product configurator demo (Three.js, TypeScript, Vite): six products with shape morphing, procedural lighting environments, price breakdown, undo/redo, saved configurations with comparison, PNG export and shareable links; sample data only.*
