<!--
FIXTURE: hand-authored "what great output looks like" for fixtures/ap-chem-u1-raw.md.
This is the reference the LLM-judge scores against (04-AI-ENGINE.md §9) and a design North Star
for the renderer. It is written in plain markdown; the real pipeline emits the NoteDocument JSON
that renders to something like this (typeset, with margin notes, rendered equations & figures).
Provenance is annotated in [brackets] here for clarity — the real UI shows it visually.
-->

# Atomic Structure & Properties — The Mole, Isotopes, and Formulas
**AP Chemistry · Unit 1 (Topics 1.1–1.4) · Big ideas: SPQ, SAP**

**In one paragraph.** Chemistry is done by the gram in the lab but by the particle in theory, so we
need a bridge between the two: the **mole**. This lesson builds that bridge (1.1), uses a **mass
spectrometer** to explain why atomic masses on the periodic table aren't whole numbers (1.2), and
then uses the mole to connect a substance's **formula** to its **composition** (1.3) and to handle
**mixtures** (1.4).

**By the end you can:**
- Convert between mass, moles, and number of particles by dimensional analysis. *(SPQ-1.A)*
- Read a mass spectrum and calculate a relative atomic mass from isotopic abundances. *(SPQ-1.B)*
- Calculate percent composition and determine empirical and molecular formulas. *(SPQ-2.A)*
- Apply mole reasoning to mixtures of known composition. *(SPQ-2.B)*

---

## 1.1 — The mole and molar mass

A **mole** is a *count*, like "a dozen" — just very large. One mole = **6.022 × 10²³** items
(the **Avogadro constant**, $N_A$). We use it because a countable number of atoms (10²³-ish) weighs
a convenient number of grams. [student: "A mole is an amount" — kept, sharpened]

**Two masses, one number.** [ai-corrected — see Correction 1]

| Quantity | What it describes | Unit | Example (carbon-12) |
|---|---|---|---|
| Atomic mass | mass of **one atom** (or one molecule/formula unit) | unified atomic mass units, **u** (a.k.a. amu) | 12 u |
| Molar mass ($M$) | mass of **one mole** of that substance | **g·mol⁻¹** | 12 g·mol⁻¹ |

They are **numerically equal** but they are *not the same thing*: one is the mass of a single
particle, the other the mass of $6.022\times10^{23}$ of them. Writing "atomic mass = molar mass"
without that distinction is exactly the shortcut AP flags.

> **Formula — mole ↔ mass**
> $$n = \dfrac{m}{M}$$
> where $n$ = amount (mol), $m$ = mass (g), $M$ = molar mass (g·mol⁻¹).
> **Use when:** you have a mass and want a number of moles, or vice-versa.

> **Formula — mole ↔ particles**
> $$N = n\,N_A \qquad N_A = 6.022\times10^{23}\ \text{mol}^{-1}$$
> $N$ = number of particles, $n$ = amount (mol).
> **Use when:** converting between moles and a count of atoms/molecules/ions.

> **Margin note · the master diagram** *(ai-added)*
> Every 1.1 problem is a walk along this chain — pick your start and finish, multiply by the right
> conversion factor at each arrow:
> ```mermaid
> flowchart LR
>   mass["mass (g)"] -- "÷ M   |   × M" --> mol["moles (mol)"]
>   mol -- "× N_A   |   ÷ N_A" --> particles["particles (atoms / molecules)"]
>   vol["volume (cm³) + density"] -- "× d" --> mass
> ```

### Worked example — atoms in a sample of mercury  [student's example, completed & checked]

**Problem.** A sample of mercury occupies 32.0 cm³. The density of mercury at 25 °C is
13.584 g·cm⁻³. How many mercury atoms are present? ($M_{\ce{Hg}} = 200.59\ \text{g·mol}^{-1}$)

**Solution.**
1. Mass from density: $m = d\,V = (13.584\ \text{g·cm}^{-3})(32.0\ \text{cm}^3) = 434.688\ \text{g}$.
2. Mass → moles: $n = \dfrac{m}{M} = \dfrac{434.688\ \text{g}}{200.59\ \text{g·mol}^{-1}} = 2.1671\ \text{mol}$.
3. Moles → atoms: $N = n\,N_A = (2.1671\ \text{mol})(6.022\times10^{23}\ \text{mol}^{-1})$.

$$\boxed{N = 1.31\times10^{24}\ \text{atoms}}$$

> **Answer is 3 significant figures** — limited by the volume, 32.0 cm³. The original notes gave
> $1.3\times10^{24}$ (2 s.f.). *(ai-clarified)*
> **Common mistake:** mercury is **monatomic**, so "atoms" is right here; if the substance were
> $\ce{O2}$ you'd get *molecules* and would need another ×2 for atoms.

---

## 1.2 — Isotopes and mass spectrometry

**Isotopes** are atoms of the **same element** (same number of protons, same $Z$) with **different
numbers of neutrons**, hence **different mass numbers** $A$ and different atomic masses. Because
chemistry is set by electrons, isotopes of an element are chemically almost identical. [student: kept, sharpened]

- A pair of isotopes is *always* the same element (that's the definition). [student: kept]
- **Relative (fractional) abundance** = the fraction of a sample's atoms that are a given isotope.
  Report it as a fraction or a percentage — it is a *proportion*, not a raw count. [ai-clarified]

> **Formula — relative (average) atomic mass**
> $$A_r = \sum_i (\text{isotope mass})_i \times (\text{fractional abundance})_i$$
> **Use when:** given a mass spectrum or a table of isotopes, to get the value on the periodic table.
> Equivalent to the notes' "multiply each mass by its %, add, divide by 100".

### The mass spectrometer

A **mass spectrometer** vaporises and ionises a sample, accelerates the ions through a magnetic
field that deflects them by **mass-to-charge ratio ($m/z$)**, and counts how many land at each
$m/z$. Output: a **stick spectrum**.

- **x-axis:** $m/z$ (effectively isotope mass, since $z = 1+$ for most peaks).
- **y-axis:** relative abundance (%), tallest peak often scaled to 100.

> **Figure 1.2 — model mass spectrum of chlorine** *(ai-added; illustrative values)*
> ```chart
> kind: bars
> x: "m/z"
> y: "relative abundance (%)"
> series:
>   - { label: "³⁵Cl", value: 75.8 }
>   - { label: "³⁷Cl", value: 24.2 }
> note: "Illustrative. Two isotopes → two peaks; heights are the abundances."
> ```
> Reading it: $A_r(\ce{Cl}) = (34.969)(0.758) + (36.966)(0.242) = 35.45$ — the periodic-table value.

### Worked example — average atomic mass of chlorine  *(ai-added)*

**Problem.** Chlorine is 75.76 % ³⁵Cl (34.969 u) and 24.24 % ³⁷Cl (36.966 u). Find $A_r(\ce{Cl})$.

$$A_r = (34.969)(0.7576) + (36.966)(0.2424) = 26.49 + 8.960 = \boxed{35.45}$$

**Common mistake:** averaging 34.969 and 36.966 directly (→ 35.97). You must *weight* by abundance.

---

## 1.3 — Pure substances: elements, compounds, and formulas

**Pure substance** = one kind of particle throughout; fixed composition. Two types:

**Elements** — one type of atom.
- **Monatomic** (exist as single atoms): the noble gases, and most metals when we write them.
- **Diatomic** (exist as two-atom molecules): the **seven diatomic elements** —
  $\ce{H2},\ \ce{N2},\ \ce{O2},\ \ce{F2},\ \ce{Cl2},\ \ce{Br2},\ \ce{I2}$.

> **Margin note · mnemonic (yours — keep it)** *(student)*
> **"Have No Fear Of Ice Cold Beer"** → **H**ydrogen, **N**itrogen, **F**luorine, **O**xygen,
> **I**odine, **C**hlorine, **B**romine. (Also: they sit in a "7" shape on the periodic table,
> plus H.) Each takes a subscript 2 when written as the element: $\ce{O2}$, not $\ce{O}$.

**Compounds** — two or more elements held together by **chemical bonds** (an attractive force
between atoms). Fixed ratio of elements. [student: kept]

| | Molecular compounds | Ionic compounds |
|---|---|---|
| Made of | nonmetals only | metal + nonmetal (or a polyatomic ion) |
| Smallest unit | a **molecule** | a **formula unit** (not a "molecule") [ai-corrected — see Correction 2] |
| Structure | discrete molecules | extended **lattice** of repeating ions |
| Example | $\ce{CO2}$, $\ce{H2O}$ | $\ce{NaCl}$, $\ce{Li2S}$ |

> **Law of definite proportions.** A given compound always contains the same elements in the same
> mass ratio. Example: in lithium sulfide, $\ce{Li2S}$, there are always **2 Li for every 1 S** —
> the formula *is* that ratio. [student's example: kept]

### Molar mass from a formula

Add the molar mass of every atom in the formula. The result is the mass of one mole of that
compound (= the mass of $6.022\times10^{23}$ molecules or formula units), and it slots straight into
$n = m/M$ and $N = nN_A$.

**Example.** $M(\ce{Li2S}) = 2(6.94) + 32.06 = 45.94\ \text{g·mol}^{-1}$.

### Empirical vs molecular formula

- **Molecular formula** — the *actual* number of atoms of each element in one molecule ($\ce{C6H12O6}$).
- **Empirical formula** — that ratio reduced to **smallest whole numbers** ($\ce{CH2O}$).
- They are related by an integer $n$:
  $$n = \dfrac{M_{\text{molecular}}}{M_{\text{empirical}}}, \qquad \text{molecular} = (\text{empirical})_n$$
- Sometimes $n = 1$ and the two formulas are identical (e.g. $\ce{H2O}$, $\ce{CO2}$). [student: kept]

### Worked example — finishing your C₅H₇N problem  [student's example, **completed** — see Open Question 1]

**Problem.** A compound has empirical formula $\ce{C5H7N}$ and molar mass 162.26 g·mol⁻¹. Find its
molecular formula.

1. Empirical molar mass: $M_{\text{emp}} = 5(12.011) + 7(1.008) + 1(14.007) = 81.12\ \text{g·mol}^{-1}$.
2. Integer multiple: $n = \dfrac{162.26}{81.12} = 2.000 \approx 2$.
3. Molecular formula: $(\ce{C5H7N})_2 = \boxed{\ce{C10H14N2}}$.

*(This compound is nicotine, $M = 162.23\ \text{g·mol}^{-1}$ — the small difference is rounding.)*
**Common mistake:** rounding $n$ from 1.8 or 2.2 straight to 2 without checking your masses — if
$n$ isn't within ~0.1 of a whole number, re-check the empirical formula.

---

## 1.4 — Mixtures

A **mixture** contains two or more substances **not chemically bonded**, in **variable** proportions
(contrast the fixed ratios of 1.3). *Homogeneous* = uniform throughout (a solution, air);
*heterogeneous* = visibly non-uniform (sand in water).

**Working with mixtures:** treat each component separately and use mole/mass reasoning on it.

### Worked example — mass of an element in a mixture  *(ai-added)*

**Problem.** A 5.00 g fertiliser sample is 28.0 % ammonium nitrate, $\ce{NH4NO3}$, by mass. What
mass of nitrogen does the sample contain from that source?

1. Mass of $\ce{NH4NO3}$: $0.280 \times 5.00\ \text{g} = 1.40\ \text{g}$.
2. $M(\ce{NH4NO3}) = 80.04\ \text{g·mol}^{-1}$; moles $= 1.40/80.04 = 0.01749\ \text{mol}$.
3. 2 N per formula unit → $0.03499\ \text{mol N}$ → $0.03499 \times 14.007 = \boxed{0.490\ \text{g N}}$.

---

## Corrections — what to relearn

1. **"Atomic mass = molar mass."** → They are **numerically equal but dimensionally and
   conceptually different**: atomic mass is the mass of one atom (units **u**); molar mass is the
   mass of one mole (units **g·mol⁻¹**). *Why it matters:* AP explicitly tests this distinction, and
   it's the difference between a particle-level and a mole-level argument. *(significant)*
2. **"Compounds containing metals form units."** → More precisely: **ionic compounds** (metal +
   nonmetal) form **formula units** within an extended **lattice** — there is no discrete "molecule
   of NaCl". Molecular compounds (nonmetals only) form real molecules. *(minor — wording)*
3. **Sig figs in the mercury answer.** $1.3\times10^{24}$ → $1.31\times10^{24}$ (3 s.f., set by
   32.0 cm³). *(minor)*
4. **"divide by 100"** works only because the notes used percentages; the general form uses
   **fractional abundances** that already sum to 1. *(minor)*

## Open questions — confirm with your teacher / textbook

1. Your notes end mid-example: *"Given the empirical formula C₅H₇N, molar mass 162.26 g/mol."*
   We finished it as $\ce{C10H14N2}$ (nicotine). **Confirm this is the example your class used** and
   that 162.26 was the *molecular* molar mass, not something else.
2. Topic **1.4 (mixtures)** is barely in your notes — the "1.3-1.4" heading covers mostly 1.3. Check
   whether your class also did **elemental analysis / combustion analysis** here; if so, add a
   worked example of that type.

## Glossary

**Mole** — an amount equal to $6.022\times10^{23}$ items. · **Avogadro constant ($N_A$)** —
$6.022\times10^{23}\ \text{mol}^{-1}$. · **Atomic mass unit (u)** — $\tfrac{1}{12}$ the mass of a
carbon-12 atom. · **Molar mass ($M$)** — mass of one mole, g·mol⁻¹. · **Isotopes** — same $Z$,
different $N$. · **Mass number ($A$)** — protons + neutrons. · **Relative atomic mass ($A_r$)** —
abundance-weighted average isotope mass. · **$m/z$** — mass-to-charge ratio. · **Pure substance** —
fixed composition. · **Empirical formula** — smallest whole-number atom ratio. · **Molecular
formula** — actual atom counts per molecule. · **Formula unit** — smallest ratio unit of an ionic
compound. · **Law of definite proportions** — a compound's element mass ratio is fixed. · **Mixture**
— unbonded components, variable proportions.

## Study next
- Practise mass↔mole↔particle chains until the diagram is automatic.
- Percent composition → empirical formula from *experimental* data (with rounding judgement).
- Preview 1.5: where those $6.022\times10^{23}$ atoms keep their electrons.

---

## Flashcards (sample — full set is 12–16)
- **Q:** Why isn't the periodic-table atomic mass a whole number? **A:** It's the abundance-weighted
  average of the element's isotope masses.
- **Q:** Numerically, $M$ in g·mol⁻¹ equals the atomic mass in u. Are they the same quantity?
  **A:** No — one is the mass of a single particle, the other the mass of a mole ($6.022\times10^{23}$).
- **Q:** Seven diatomic elements? **A:** H₂ N₂ O₂ F₂ Cl₂ Br₂ I₂ ("Have No Fear Of Ice Cold Beer").
- **Q:** Empirical → molecular formula, what do you need? **A:** The molecular molar mass; then
  $n = M_\text{mol}/M_\text{emp}$ and multiply subscripts by $n$.
- **Q:** Smallest unit of NaCl? **A:** A formula unit (not a molecule) — it's a lattice.

## Quick quiz (sample — full set is 6–10)
1. *(MC)* 3.0 mol of $\ce{CO2}$ contains how many **oxygen atoms**?
   A) $1.8\times10^{24}$  B) $3.6\times10^{24}$  C) $6.0\times10^{23}$  D) $1.2\times10^{24}$ —
   **B** ($3.0 \times 2 \times N_A$). *(from 1.1)*
2. *(short)* Element X: 60.0 % isotope 68.9 u, 40.0 % isotope 70.9 u. $A_r$? —
   $0.600(68.9)+0.400(70.9)=\mathbf{69.7}$. *(from 1.2)*
3. *(short)* A compound is 40.0 % C, 6.7 % H, 53.3 % O by mass. Empirical formula? —
   C: 3.33, H: 6.6, O: 3.33 → 1:2:1 → **CH₂O**. *(from 1.3)*
