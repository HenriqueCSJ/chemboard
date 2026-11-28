# Page scripts

A page script turns a ChemBoard page into an animated slide. It is a short text with one instruction per line. The first part creates objects, and the second part says what happens at each click. Open it with **Menu → Page script…**, or right-click an empty part of the board.

Applying a script creates ordinary board objects that you can move, edit and draw over. Applying it again rebuilds only what the previous script created. A script error names its line and leaves the page as it was.

```text
# Lines starting with # are comments.
frame 2400 1350
text title "Arrhenius equation" at 140 110 size 84 bold
equation e1 "k = A\,e^{-E_a/RT}" center 1200 560 size 150
equation e2 "\ln k = \ln A - \frac{E_a}{RT}" over e1 size 150
text note "activation energy" center 1200 900 size 48 color orange

write title
step
write e1
step
indicate e1 "E_a" color orange
with appear note from below
step
disappear note
transform e1 into e2
step
surround e2 "\frac{E_a}{RT}" color blue
```

Every instruction has an English and a Portuguese form, and the two can be mixed. Names start with a letter and contain no spaces or dots. Numbers accept a decimal comma or point (`1,5` or `1.5`), so separate list items with a comma followed by a space.

## Page

| English | Portuguese | What it does |
| --- | --- | --- |
| `frame 2400 1350` | `quadro 2400 1350` | Sets the slide frame. The view fits it when the page opens. A new page gets this frame by default. |
| `page "Name"` | `pagina "Nome"` | Renames the page. |

## Objects

The name comes right after the instruction. Coordinates are board units, with the origin at the top left of the frame.

| English | Portuguese | Notes |
| --- | --- | --- |
| `text t "Hello" at 140 110 size 60 bold` | `texto t "Olá" em 140 110 tamanho 60 negrito` | `\\` breaks the line. `width 900` wraps the text. `serif`, `mono` and `plain` (no chemical formatting) are available. Inline LaTeX goes between `$…$`. |
| `equation e "E = mc^2" center 1200 500 size 120` | `equacao e "E = mc^2" centro 1200 500 tamanho 120` | The same LaTeX subset as board equations. |
| `molecule m "H2O" below e size 44` | `molecula m "H2O" abaixo de e tamanho 44` | A Lewis structure generated from the formula. `size` is the atom letter size. |
| `rect r from 100 100 to 600 400 color blue` | `retangulo r de 100 100 ate 600 400 cor azul` | Also `box` (rounded), `ellipse`, `circle`, `triangle`, `diamond`, `line` and `arrow`. Options: `thickness 4`, `filled`, `soft`, `dashed`. Shapes also accept `center X Y size W H`. |
| `panel p 100 300 1100 900 color green` | `painel p 100 300 1100 900 cor verde` | A soft background panel (x, y, width, height), locked and behind everything. |
| `chart g center 1200 800 size 900 520 font 28` | `grafico g centro 1200 800 tamanho 900 520 letra 28` | Followed by the chart lines below. |
| `table tb at 200 700 font 30` | `tabela tb em 200 700 letra 30` | Followed by one line per row, such as `\| a \| b \| c`. `width 600` limits the width of a column. |

Chart lines follow the `chart` instruction:

| English | Portuguese |
| --- | --- |
| `title "N₂"` | `titulo "N₂"` |
| `x "v / m s⁻¹" from 0 to 2000` and `y "f(v)"` | `x "v / m s⁻¹" de 0 ate 2000` and `y "f(v)"` |
| `function "London: -1/x^6 [1; 4]" color blue` | `funcao "London: -1/x^6 [1; 4]" cor azul` |
| `parameter "T = 300 [100; 2000] K"` | `parametro "T = 300 [100; 2000] K"` |
| `series "data" 1 2 2 4 3 3 points color red` | `serie "dados" 1 2 2 4 3 3 pontos cor vermelho` |
| `hline 25 "room temperature"` | `referencia 25 "temperatura ambiente"` |
| `legend box`, `legend end` or `legend none` | `legenda caixa`, `legenda fim` or `legenda nenhuma` |

### Position

| English | Portuguese | Meaning |
| --- | --- | --- |
| `at X Y` | `em X Y` | Top-left corner. |
| `center X Y` | `centro X Y` | Center. |
| `below e 40`, `above e`, `right of e`, `left of e` | `abaixo de e 40`, `acima de e`, `direita de e`, `esquerda de e` | Next to another object, centered on it. The number is the gap. |
| `over e` | `sobre e` | Same center as another object, which suits the target of a transformation. |

An object without a position goes below the previous one. Colors are `blue`, `red`, `green`, `orange`, `violet`, `pink`, `yellow`, `gray` and `main`, or `p0` to `p7` for the board pens, or a hex value such as `#1f6feb`.

## Scene

`step` (or `click`, `passo`, `clique`, or a line of dashes) waits for a click. Lines before the first step play when the presenter arrives at the page. Inside a step, each line starts when the previous one ends.

| English | Portuguese | What it does |
| --- | --- | --- |
| `write a, b` | `escreve a, b` | Text is written glyph by glyph, and figures, molecules, tables and charts are traced. `draw` and `create` (`desenha`, `cria`) do the same. |
| `appear a from below` | `aparece a de baixo` | Fades in, optionally arriving from `below`, `above`, `left` or `right`. |
| `grow a` | `cresce a` | Grows from its center. |
| `disappear a to above` | `some a para cima` | Fades out. |
| `erase a` and `shrink a` | `apaga a` and `encolhe a` | The reverse of `write` and of `grow`. |
| `transform a into b` | `transforma a em b` | Glyphs and strokes present on both sides travel to their new place, and the rest fades out and in. `a` leaves the scene. |
| `copy a into b` | `copia a em b` | The same transformation, keeping `a`. |
| `react h2, o2 into w1, w2` | `reage h2, o2 em w1, w2` | For molecules. Every atom travels from the reactants to the products, bonds break and form, and the reactants stay dimmed. Add `out` (`some`) to remove them. Draw every atom on both sides, and put this line first in its step. |
| `indicate a "part" color orange` | `destaca a "trecho" cor laranja` | Pulses and changes color for a moment. Without a part, the whole object. |
| `flash a` and `wiggle a` | `pisca a` and `balanca a` | Other ways of calling attention. |
| `surround a "part" keep oval` | `contorna a "trecho" fica oval` | Draws a box around the object or part and removes it. `keep` leaves it, and `oval` changes the shape. |
| `underline a "part" keep` | `sublinha a "trecho" fica` | Draws a line under the object or part. |
| `color a "part" red` | `cor a "trecho" vermelho` | Changes the color for the rest of the page. |
| `move a to X Y` or `move a by DX DY scale 0.8` | `move a para X Y` or `move a por DX DY escala 0,8` | Moves the center to a point, or by an offset. `scale a 1.5` and `rotate a 30` also work alone. |
| `count n to 1200` | `conta n ate 1200` | The first number in text `n` counts up or down to the value. `from 0` and `decimals 2` are optional. |
| `vary g.T to 1200` | `varia g.T ate 1200` | Parameter `T` of chart `g` sweeps to the value, and the curves follow. |
| `follow n g.T` or `follow v g "sqrt(2*8.314*T/0.028)"` | `segue n g.T` or `segue v g "sqrt(2*8,314*T/0,028)"` | From this step on, the first number in text `n` shows parameter `T` of chart `g`, or a formula of the chart's parameters. It tracks scripted sweeps and the slider moved by hand. The number keeps the decimals written in the text, or `decimals 1` sets them. |
| `play d` | `anima d` | Plays the object's own animation: an MO diagram builds, curved arrows run their mechanism, orbitals approach. |
| `dim a` | `esmaece a` | Dims the object for the rest of the page. |
| `camera a, b margin 80` or `camera all` | `camera a, b margem 80` or `camera tudo` | A click that moves the view to the objects, or back to the frame. |

A quoted part is a piece of the text or equation written the way it appears in the object, such as `"E_a"` or `"\frac{1}{T}"`. A number after it picks one occurrence: `indicate e "x" 2`.

### Timing

| English | Portuguese | What it does |
| --- | --- | --- |
| `with …` | `junto …` | Starts the line together with the previous one. |
| `… in 2s` | `… em 2s` | Sets the duration. |
| `… cascade` | `… cascata` | Staggers the targets of the line. A number sets the delay between them. |
| `… delay 0.5` | `… atraso 0,5` | Starts the line later. |
| `wait 0.5` | `espera 0,5` | Pauses inside the step. |

## Objects drawn by hand

Right-click an object and choose **Name in the script…**. For a molecule, the name covers all of its atoms and bonds. The script can then use that name like any other. To give an object an entrance without a script, right-click it, choose **Appear at step N**, and turn on **Enter being written or drawn**.

Images, videos, orbital drawings, interacting orbitals and particle simulations only fade in and out. When a script asks for more than that from one of them, **Apply** shows a warning with the line number.

## Presenting

A scripted page opens at the start of its scene. **→** or **PgDn** plays the next step. **←** or **PgUp** restores the previous step, or reverses an authored scene handoff. **Esc** returns to editing. **F** enters full screen and **U** hides the controls. Outside the presentation, objects that leave the scene are drawn faint so that successive versions of an equation do not pile up. A selected object is drawn in full.

**Save board (.json)** includes the compiled pages and presentation cues. Leave **Include editable scripts** checked to keep the page and lecture scripts in the same JSON. After reopening it, use **Page script…** or **Animation script…** to edit the embedded source. Clear the checkbox to share the presentation with its cues and animations while omitting the source text. **Save script** in the animation editor still exports a separate `.chemboard` file.

Pen and Highlighter marks belong to the current presentation cue for the session. You can undo or clear those marks without changing the saved page.

A chart slider stays live during the presentation. Drag it or press **▶** at any step, and the curves and the numbers that follow the chart respond. On a chart that the script created, and on any parameter that the script varies or that a number follows, what you do by hand belongs to the scene. It lasts until the script varies that parameter again (the sweep starts from where you left it) or until you go back to an earlier step. The chart keeps its saved value, so the slide starts the same way next time. On other charts the slider saves the value, as it does on any page. A chart that the script has moved, scaled or rotated answers where it is drawn.

An image of a scripted page (**Export image (PNG)**, **Copy page image** and the image an assistant requests) leaves out the objects that have left the scene. Numbers that count and objects that move appear in their starting state. An image of a selection contains exactly what is selected.

## For AI assistants

`get_page_script` returns the current script, the names on the page and this reference in compact form. `set_page_script` applies a whole script and reports the error line when it does not parse. `name_objects` names existing board objects so a script can animate them.

## Combine page scripts and scene transitions

Open **Menu → Animation script…** for a multi-page lesson. Put `roteiro pagina` after a scene header to write the rest of that scene using the commands on this page. Give a carried object the same name at the previous scene's final step and the next scene's opening. Here one click morphs the circle and counts to 100. The next click moves the resulting rectangle across the boundary.

Multi-page lesson scripts can have up to 400,000 characters. A board export with editable scripts stores each distinct full lesson script once, even when many pages share it.

```text
cena "Shape and measure" fundo #f3efe4
roteiro pagina
circle seed center 460 520 size 240 filled color red
rect marker center 820 520 size 300 240 filled color blue
text value "25 points" at 240 800 size 88
appear seed
step "Change the shape and measure"
transform seed into marker in 1.2s
with count value to 100 in 1.2s

cena "Another view" fundo #f5f0f0
roteiro pagina
rect marker center 1800 520 size 410 240 filled color green
transicao 1600 marker
step "Hold here for discussion"
```

Page-script effects preserve their timing within each cue. Formula poses that contain matching `\term{id}{…}` annotations preserve the identity of those terms.

## Shared parameters, paths and insets

```text
slider amount "T = 0 [0; 1]" at 120 100 size 410
circle marker center 400 530 size 65 filled color blue
text reading "Progress 0.00" at 120 185 size 38
bind marker x from amount "400 + 500*T"
bind marker color from amount "T" blue violet
bind reading value from amount "T" decimals 2
inset closeup at 1350 400 size 800 460 source 300 400 650 300 marksource
step "Sweep the same control you can drag"
vary amount.T to 1 in 2s
```

A standalone `slider` (`controle`) and a parameterized chart can both supply values to `bind` (`vincula`). Use the center coordinates `x` and `y`, `angle` in degrees, `scale`, shape `width` and `height`, free line endpoints `x1`, `y1`, `x2` and `y2`, `color` between two colors, or a text `value`. The color expression runs from 0 to 1. `inset` (`detalhe`) redraws a live rectangle of the board. Its `source` (`origem`) takes x, y, width and height. `marksource` (`marcar-origem`) outlines that rectangle on the main board.

```text
circle marker center 300 600 size 65 filled color blue
path routeName "300,600 480,410 715,380 950,590" hidden
step "Move the marker along the curve"
travel marker along routeName in 2s trail color blue
```

`path` (`trajeto`) makes a smooth path through the given board coordinates. Add `polyline` (`angular`) for straight segments, or `hidden` (`oculto`) to hide the guide. `travel` (`percorre`) also accepts a named free line, arrow or ink stroke. `trail` (`rastro`) draws the part of the path already traveled. Going back removes the trail and restores the object's prior position.

## Areas and Riemann sums

```text
chart curve center 1150 670 size 1350 760
x "x" from 0 to 2
y "f(x)" from 0 to 4
function "f: x^2 [0; 2]" color blue
parameter "N = 4 [4; 32]"
area "f" from 0 to 2 color blue opacity 0.2 value "Integral"
riemann "f" from 0 to 2 rectangles "N" midpoint color orange value "Sum"
step "Refine the partition"
vary curve.N to 8 in 1.3s
step "Refine again"
vary curve.N to 32 in 1.6s
```

`area` shades the region between a named curve and the baseline. Use `baseline` for a constant or `against "other"` for a second curve. Add `negative violet` to give negative contributions their own color. `riemann` takes a rectangle count and a sampling position (`left`, `midpoint` or `right`). A literal count is an integer between 1 and 256. Quoted expressions for bounds, count and opacity can use the chart's parameters. `value` shows the numerical integral or rectangle sum. To edit these overlays in the board, double-click the chart.

## Spatial drawings and matrices

Open the **IC677** lessons under **Ready-made lectures**. The short [water and matrices](../examples/ic677-simetria-agua.chemboard) and [cubic cells](../examples/ic677-celulas-cubicas.chemboard) scripts are useful starting points. The full [molecular symmetry](../examples/ic677-simetria-molecular.chemboard) script uses `molecula3d` for labelled molecular models and `caracteres` for character tables. The full [solid-state](../examples/ic677-estado-solido.chemboard) script uses `rede` for adjustable crystal lattices. Open these files from **Animation script… → Open file…** to explore the definitions and cues. Shared objects carry across scenes and **PgUp** restores the previous state. Drag the model with the Hand tool to orbit it. **Shift + drag** pans the board through the model. Changing the camera leaves the operation in the same Cartesian basis.

To use a molecule from the toolbox, select the structure and open **View in 3D**. **Insert live 3D model** puts it on the current page. The model keeps the viewer's geometry and has a script name such as **mol3d**. Open **Page script…** to see the model name and atom IDs, or right-click the model to rename it. You can use it directly in a cue.

~~~text
quadro 2400 1350
move mol3d para 605 735 em 0.1s
matriz M centro 1660 735 tamanho 510 380 letra 65
fila 1 0 0
fila 0 1 0
fila 0 0 1
passo "Mostre o eixo z"
eixos mol3d mostra z em 0.4s
passo "Gire 180° e mostre a matriz da operação"
aplica mol3d eixo z 180 matriz M em 1.3s
passo "Oculte o eixo"
eixos mol3d oculta em 0.4s
~~~

Use **Apply and present** to try the cues with the arrow keys or a clicker. This example uses the z axis of the inserted model's coordinate frame. Whether that rotation is a symmetry depends on the structure and its orientation in that frame.

```text
espacial agua centro 630 690 tamanho 900 700 escala 280
sitio O 0 0 0 "O" cor red raio 64
sitio Ha 0.791 0 0.612 "Hₐ" cor #E8E8DF raio 48
sitio Hb -0.791 0 0.612 "Hᵦ" cor #E8E8DF raio 48
aresta O Ha
aresta O Hb
vista -24 15
matriz M centro 1650 700 tamanho 510 380 letra 65
fila 1 0 0
fila 0 1 0
fila 0 0 1
observa agua Ha em 0.3s
passo "Refletir no plano yz"
aplica agua plano yz matriz M em 1.3s
```

The points use the fixed Cartesian coordinates you author. `aplica` also takes `eixo z 180` or `inversao`. `guia agua eixo z` prepares a rotation guide. `eixos agua mostra z` and `eixos agua oculta` control axis visibility within the cues. The axis button beside the orbit control also works during class. `observa agua Ha` adds a glow to the named site and focuses the correspondence on it. `observa agua ponto 0 1 0` adds a distinct test point and shows its image under a reflection or inversion. Clear either with `observa agua limpa`.

`produto A B em C célula 1 1 escolha leitura 1200 1050 1850 65` selects the first row and first column and matches each pair of factors by position. The destination cell is outlined and the readout keeps the result as a question mark. On the next step, repeat the command without `escolha` to reveal that one entry. `leitura` takes the center x and y, width and font size. Use `produto A B em C` to reveal the full product. Add `vazia` (`blank`) to C so its rows define the dimensions and the entries appear only when computed.

```text
cristal cubo centro 850 680 tamanho 1160 920 escala 420 tipo primitiva
vista -32 22
passo "Centralize o corpo da célula"
centra cubo corpo em 1.3s
passo "Mude para faces centradas"
centra cubo faces em 1.3s
passo "Repita a célula duas vezes em cada direção"
replica cubo 2 2 2 em 1.7s
```

`camada cubo z 0.5` emphasizes the section at z = 0.5 in first-cell coordinates. `observa cubo 0 0 0.5` highlights its face site even when you add adjacent cells. Both accept `limpa` to clear the emphasis. The WebGL renderer is initialized when a spatial object is first displayed. A Canvas projection supports the same cues when WebGL is unavailable.

### Symmetry elements, lattices and character tables

The full IC677 scripts use three additional objects. Each object can reveal its annotations independently as the scene advances.

- **Molecules.** Use `molecula3d` with `atomo ID ELEMENT X Y Z` in Å, `ligacao A B`, and `elemento C3 eixo 0 0 1 ordem 3 "C_3"`. Use `exibe nh3 base, eixos, C3` to show the moving basis and the fixed laboratory axes. `aplica nh3 C3 matriz M` turns the model and fills the matrix. A named symmetry element can also be a plane, an inversion center, or an improper axis. `projecao` defines a linked view along an axis, while `modo` and `vibra` define and animate a displacement pattern.
- **Lattices.** Use `rede` with `celula a b c alpha beta gamma`, `centragem F` and a motif of `atomo ID fx fy fz` entries in fractional coordinates. Cues can change the cell, replicate it, reveal a slice or highlight neighbors and voids.
- **Character tables.** Use `caracteres` with `grupo`, `classe`, `irrep` and `gama` definitions. A cue such as `traco M` highlights a matrix trace. `revela tc celula G C3 de M` transfers it to the character table. `reduz tc E` shows the terms of an irreducible-representation reduction.
