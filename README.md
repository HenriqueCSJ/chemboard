# ChemBoard

ChemBoard is an interactive browser whiteboard for teaching chemistry. Draw Lewis structures during class, illustrate reactions and molecular orbitals, and guide students through multi-page lessons one step at a time. The interface is available in English and Brazilian Portuguese.

[Open ChemBoard](https://henriquecsj.github.io/chemboard/) · [Report an issue](https://github.com/HenriqueCSJ/chemboard/issues)

## Get started

1. Open ChemBoard in a current desktop browser and choose a language.
2. Start with a blank board, or open **Menu → Ready-made lectures** to add an interactive lesson.
3. On a lesson page, use **Step by step** or **→** to begin. Use **←** to go back and **Esc** to exit. The presentation toolbar includes pause and playback speed.
4. Use **Menu → Save board (.json)** to keep a portable copy. Open it on another device through **Menu → Open board**.

| Shortcut | Action |
| --- | --- |
| **L** | Lewis structure pen |
| **V** | Select and edit |
| **Space + drag** | Pan the board |
| **D** | Open the selected molecule in 3D |
| **F** | Toggle full screen |
| **?** | Open help and shortcuts |

## What you can teach with it

- **Structure and bonding** · Draw molecules, lone pairs, formal charges, ionic interactions, rings, and curved electron arrows. Open a 3D molecular view or an atomic orbital panel.
- **Orbitals and reactions** · Build molecular orbital diagrams, show orbital overlap, and animate mechanisms and selected reaction examples.
- **Interactive lectures** · Combine text, equations, charts with adjustable parameters, particle models, tables, images, and video on a multi-page board. Save views and reveal objects in sequence.
- **Classroom presentation** · Switch themes, use a laser pointer or spotlight, enlarge a section of the board, and export a page as PNG.

## Example lectures

Both lectures are in Portuguese. Use the in-app lecture picker, or download a JSON file and open it as a board.

| Board | Content |
| --- | --- |
| [Animation examples](examples/animation-examples.json) | Eight pages on step-by-step playback, reaction animations, molecular orbital diagrams, crystal field splitting, charts, orbital overlap, and mechanisms. |
| [Intermolecular interactions](examples/intermolecular-interactions.json) | Nine pages on states of matter, five types of intermolecular interaction, and comparisons using models, charts, and tables. |

## Run locally

Open [`index.html`](index.html) from a local copy of this repository, or serve the repository root:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Then open [localhost:8000](http://127.0.0.1:8000/). The app is plain HTML, CSS, and JavaScript with bundled Three.js. GitHub Pages serves the root of `main` directly.

Core drawing and the built-in lessons work offline from the local HTML. Online molecule lookup, remote media, and web fonts require a connection. The 3D view needs browser WebGL support. Autosave uses browser storage on the current device and site. Export important boards as JSON before changing browsers or clearing site data.

## Contributing

When reporting a bug, include your browser and version, the steps and expected result, and a small board file that reproduces it if you can share one. For a pull request, include which board or classroom workflow you checked.

## License

ChemBoard uses the [Apache License 2.0](LICENSE). The bundled [Three.js](https://github.com/mrdoob/three.js) code is under the MIT License, with its license text in `index.html`.
