// Paints Stageview standees with the stage authoring pipeline: a full-body front on a green screen, a back conditioned
// on that front, a distance-from-green key, and a portrait cropped from the keyed front. See wiki/stage-authoring.md.
//
//   node --env-file=.env.local --import tsx scripts/stage-standees.ts front human-a,elf-b   # new raw fronts
//   node --env-file=.env.local --import tsx scripts/stage-standees.ts back human-a           # back from the latest front
//   node --env-file=.env.local --import tsx scripts/stage-standees.ts key human-a            # cutouts and portrait
//   node --env-file=.env.local --import tsx scripts/stage-standees.ts all                    # every figure, all three steps
//
// Raw renders go to STANDEE_RAW (default: the OS temp dir). The API key is read from GOOGLE_GENERATIVE_AI_API_KEY and is
// never printed. Review every front against its description before keying: a pose or costume can come back wrong.

import { existsSync } from "node:fs"
import { appendFile, mkdir, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"

const MODEL = "gemini-3.1-flash-image"
const RAW = process.env.STANDEE_RAW ?? join(tmpdir(), "d20-standees")
const STAGE = "public/stage"
const STYLE = "design/stage/styleref.jpg"
// A finished standee, for finish and detail only.
const FINISH = "public/stage/fixtures/march-of-davos/yeva-front.webp"
const PORTRAIT_BG = "#3b4256"

// `backNote` adds to the back prompt when a back keeps coming out wrong (an open cloak drawn behind a front-facing body).
// `seated` paints the figure sitting on the stool it brings, for a tavern's patrons.
type Figure = { out: string; who: string; look: string; ref?: string; head: number; backNote?: string; seated?: boolean }
const stock = (who: string, look: string, head = 0.13): Figure => ({ out: "", who, look, head })
// Stock figures stand in for created heroes: one per race and build, dressed for travel with no class gear, so any class
// reads true. Heads are the share of figure height a portrait frames around.
const FIGURES: Record<string, Figure> = {
  "human-a": stock(
    "Human man",
    "In his thirties, short dark-brown hair and a trimmed beard, weathered tan skin. A hooded oak-brown travelling cloak over a moss-green wool tunic and a leather jerkin, a belt with pouches, brown trousers and worn boots, a satchel at one hip."
  ),
  "human-b": stock(
    "Human woman",
    "In her late twenties, auburn hair in a long braid, freckles. A rust-orange hooded cloak over an undyed cream linen shirt, a laced brown leather bodice, a belt with pouches, dark trousers and tall boots."
  ),
  "elf-a": stock(
    "Elf man",
    "Tall and slender, pointed ears, long straight silver-blond hair tied back, fair skin, calm grey eyes. A long forest-green cloak, a fitted grey-green tunic with fine leaf embroidery, a slim belt with a pouch, soft leather boots."
  ),
  "elf-b": stock(
    "Elf woman",
    "Tall and graceful, pointed ears, long black hair in a loose plait, warm brown skin, amber eyes. A sage-green hooded mantle, an ochre travelling dress over leggings, a leather belt with a pouch, soft boots."
  ),
  "half-elf-a": stock(
    "Half-Elf man",
    "Slightly pointed ears, wavy chestnut hair to the jaw, light stubble, olive skin. A dusty navy short cloak, an ochre doublet, a leather belt with pouches, grey trousers and boots."
  ),
  "half-elf-b": stock(
    "Half-Elf woman",
    "Slightly pointed ears, shoulder-length copper-red hair, green eyes, fair freckled skin. A forest-green cloak with the hood down, a cream blouse, a brown leather vest, a belt with pouches, trousers and tall boots."
  ),
  "dwarf-a": stock(
    "Dwarf man",
    "Very short and very broad, about 1.4 m tall, with stout dwarf proportions, not a short human. A long braided black beard with iron rings, a bald crown with a fringe of hair, ruddy skin. A heavy brown leather coat over a rust-red tunic, a thick belt with an iron buckle, sturdy boots.",
    0.17
  ),
  "dwarf-b": stock(
    "Dwarf woman",
    "Very short and very broad, about 1.35 m tall, with stout dwarf proportions, not a short human. Thick blond hair in two braids, rosy cheeks, a strong jaw. An olive-green cloak, a quilted leather jerkin over a cream shirt, a wide belt with pouches, heavy boots.",
    0.17
  ),
  "halfling-a": stock(
    "Halfling man",
    "Only about 1.1 m tall, a child-sized body with an adult face. Curly sandy hair, a round cheerful face, bare hairy feet. A mustard-yellow waistcoat over a cream shirt, brown breeches, a short green cloak, a satchel.",
    0.19
  ),
  "halfling-b": stock(
    "Halfling woman",
    "About 1.05 m tall, a child-sized body with an adult face. Dark curly hair tied up with a ribbon, warm brown skin, bare feet. A rust-orange hooded short cloak, a green dress with a brown apron skirt, belt pouches.",
    0.19
  ),
  "gnome-a": stock(
    "Gnome man",
    "Only about 1 m tall, small with a large head and an adult face. A big nose, bushy white eyebrows and a short white beard, bright blue eyes, a brown pointed cap. A patched teal coat with many pockets, a leather belt with pouches, tall boots. Hands empty and relaxed.",
    0.22
  ),
  "gnome-b": stock(
    "Gnome woman",
    "About 0.95 m tall, small with a large head and an adult face. Wild auburn hair in two puffs held by a leather headband, big hazel eyes, freckles. A short ochre coat with wooden buttons and many pockets, striped stockings, little boots.",
    0.22
  ),
  "half-orc-a": stock(
    "Half-Orc man",
    "Tall and heavily muscled, about 1.95 m, grey-green skin, small tusks from the lower jaw, black hair in a topknot, old scars on his arms. A sleeveless brown leather jerkin, a fur-trimmed mantle over one shoulder, a wide belt, dark trousers and boots."
  ),
  "half-orc-b": stock(
    "Half-Orc woman",
    "Tall and strong, about 1.85 m, olive-green skin, small tusks, black hair shaved on one side and braided on the other, gold earrings. A rust-red sleeveless tunic over a leather vest, bracers, a wide belt, dark trousers and boots."
  ),
  // Premades whose web portraits predate Stageview, painted from those portraits.
  wrenna: {
    out: "fixtures/march-of-davos/wrenna",
    who: "Wrenna of Faelendar, Elf female ranger",
    look: "A tall, watchful elf woman with moss-green eyes and ash-blonde hair in braids. Grey-green scout leathers of the Valkarr Forest with a dark green cloak and leather bracers, a quiver of arrows on her back and a pale yew longbow held in her left hand.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/march-of-davos/pcs/wrenna-faelendar.png",
    head: 0.13,
  },
  ilya: {
    out: "fixtures/march-of-davos/ilya",
    who: "Ilya Veles, Half-Elf male bard",
    look: "A graceful half-elf man with laughing grey eyes, dark hair worn loose past his collar, and a warm smile. A long festival coat of green and black Valkaran embroidery in gold over an Asterian cut, an orange sash, dark trousers and boots. A seven-stringed gusle slung across his back.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/march-of-davos/pcs/ilya-veles.png",
    head: 0.13,
  },
  lyra: {
    out: "fixtures/covert-cargo/lyra",
    who: "Lyra Silvanus, Asterian female arcanist",
    look: "A young scholarly woman with neat dark hair tied back, intelligent eyes behind round wire spectacles, a few freckles. A teal-blue scholar's coat over a white cravat and waistcoat, a worn leather satchel of scrolls at her hip, a thick leather-bound book held against her side.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/covert-cargo/pcs/dc23c6a6-6247-4384-bccc-2eeed66a7b0c.png",
    head: 0.13,
  },
  poppen: {
    out: "fixtures/covert-cargo/poppen",
    who: "Poppen Quickfoot, Halfling male rogue",
    look: "Just over three feet tall, a child-sized body with an adult face. Curly chestnut hair cropped short, bright hazel eyes, a mischievous grin. A patchwork waistcoat of red, blue and ochre squares full of hidden pockets over a cream shirt, brown breeches, scuffed pale leather boots.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/covert-cargo/pcs/b44179ad-0e8e-4d1e-8b17-8c436dbeb15a.png",
    head: 0.19,
  },
  // Covert Cargo's cast, painted from their web portraits.
  reinhard: {
    out: "fixtures/covert-cargo/reinhard",
    who: "Reinhard, Human male enforcer",
    look: "A burly, broad-shouldered man with a square, scarred, scowling face, a heavy brow, close-cropped black hair and a strong jaw. A long dark green-black leather greatcoat with a high turned-up collar and buckles, worn open over a rust-brown tunic, dark trousers and heavy boots. A longsword in his right hand, point down.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/covert-cargo/npcs/236683b0-4745-4a8c-ad9d-48ed3bbaf908.png",
    head: 0.13,
  },
  silas: {
    out: "fixtures/covert-cargo/silas",
    who: "Silas, Human male rogue",
    look: "Lean and wiry, a narrow hard face with grey stubble and watchful grey eyes in the shadow of a deep hood. A hooded charcoal cloak over close-fitting dark leather armour with straps and buckles, a belt with pouches, a coiled rope and grappling hook at his hip, dark boots. A long dagger in each hand, held low.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/covert-cargo/npcs/3959ac3c-b63a-4e88-9cce-6a2d69f2bc52.png",
    head: 0.13,
    backNote:
      "His deep hood is up and covers the whole back of his head, so no hair or scalp shows. The cloak hangs straight down his back from the shoulders to the calves and hides his back completely: we see the outside of the cloak, not his chest, belt, pouches or buckles. His hands and weapons show only at his sides.",
  },
  aelar: {
    out: "fixtures/covert-cargo/aelar",
    who: "Aelar Moonglimmer, Elf male operative",
    look: "A lean, agile elf with a refined, lined face, sharp grey eyes and silver hair tied back from pointed ears. A dark shadowy cloak over close dark leather clothes, a moon-silver dagger at his belt, soft dark boots.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/covert-cargo/npcs/e8e02409-93a9-4936-8b2e-b5a3d083889d.png",
    head: 0.13,
    backNote:
      "The cloak hangs straight down his back from the shoulders to the calves and hides his back completely: we see the outside of the cloak, not his chest, belt, pouches or buckles. His hands and weapons show only at his sides.",
  },
  "elf-archer": {
    out: "fixtures/covert-cargo/elf-archer",
    who: "Elven Archer, Wood Elf female archer",
    look: "Tall and slender with pointed ears, wavy pale blond hair in loose braids with small feathers, green eyes and a faint scar on her left cheekbone. A white blouse under a forest-green leather jerkin, dark red leather bracers, a quiver of arrows on her back, a longbow held in her left hand, leggings and soft boots.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/covert-cargo/npcs/66faef7d-7d77-4aac-bdec-83850e136f5f.png",
    head: 0.13,
  },
  "elf-fighter": {
    out: "fixtures/covert-cargo/elf-fighter",
    who: "Elven Fighter, Elf male fighter",
    look: "Tall and lean with sharp angular features, green eyes and long silver hair tied back from pointed ears. A dark green hooded cloak over rust-brown reinforced leather armour with a baldric, a round wooden shield on his back, an elven longsword held point down in front of him, boots.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/covert-cargo/npcs/ce082298-d090-47b2-a3b9-5af7c851dec7.png",
    head: 0.13,
  },
  // March of Davos, Clan Conflict: the two leaders from their portraits and the encounter art, and two followers each.
  barok: {
    out: "fixtures/march-of-davos/barok",
    who: "Barok Redbeard, Human male warrior",
    look: "A burly, barrel-chested man in his forties, about 1.9 m tall, with tall human proportions and long legs, not a dwarf. Curly brown hair, a long bushy beard dyed rust-red reaching his chest, two fresh red scratches across one cheek, a fierce scowl. Mismatched battle-worn armour: big scuffed blue-steel pauldrons with dented silver edges and a round star medallion, a dark steel breastplate over a deep-blue padded sleeves, a worn leather war belt and tassets, steel vambraces, heavy boots. A longsword in its scabbard at his left hip, his right hand resting on the hilt.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1725127621254",
    head: 0.13,
  },
  larya: {
    out: "fixtures/march-of-davos/larya",
    who: "Larya Halloway, Human female rogue",
    look: "A tall, strong woman in her thirties, about 1.8 m. Long dark-brown hair worn half up, the rest falling past her shoulders, a diagonal red scar across her left cheek, a dark teardrop earring, a hard, proud glare. A finely tailored sleeveless tunic of ochre-gold cloth with a patterned silver-grey collar, a tooled leather shoulder strap, dark leather bracers to the elbow, a slim belt with a fine silver buckle, dark fitted trousers and tall boots. A long dagger sheathed at her hip.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1725127643282",
    head: 0.13,
  },
  "barok-bruiser": {
    out: "fixtures/march-of-davos/barok-bruiser",
    who: "Barok's man, Human male brawler",
    look: "A big rough man in his forties with shaggy brown hair, a braided brown beard and a scarred brow. A heavy brown fur mantle over a dented mail shirt and a mismatched leather jerkin, one iron vambrace, a wide belt with a pouch, rough trousers and worn boots. A hand axe held low in his right hand.",
    head: 0.13,
  },
  "barok-sellsword": {
    out: "fixtures/march-of-davos/barok-sellsword",
    who: "Barok's woman, Human female sellsword",
    look: "A hard-faced woman in her thirties with cropped black hair and a once-broken nose. Patched brown leather armour with a single dented steel pauldron on her left shoulder, a short mail skirt, a rope belt, scuffed boots. A heavy wooden cudgel held in her right hand.",
    head: 0.13,
  },
  "larya-retainer": {
    out: "fixtures/march-of-davos/larya-retainer",
    who: "Larya's retainer, Human male swordsman",
    look: "A lean, upright man in his thirties with neat dark hair and a trimmed beard. A tailored deep-green Valkaran long coat with gold embroidery at the cuffs and collar, fine silver chains across the chest, a cream shirt, dark trousers and polished boots. A rapier at his left hip, his hand on its hilt.",
    head: 0.13,
  },
  "larya-kinswoman": {
    out: "fixtures/march-of-davos/larya-kinswoman",
    who: "Larya's kinswoman, Human female noble",
    look: "A proud woman in her twenties with auburn hair in an intricate braided crown, gold drop earrings and a jewelled gold collar. A fine russet coat with ochre trim over a cream blouse, a green sash, a slim dagger at her belt, soft leather boots. Arms folded.",
    head: 0.13,
  },
  // March of Davos, the Dragonbone Inn: the innkeeper and the inn's visitors from their portraits, a bard, and patrons.
  bram: {
    out: "fixtures/march-of-davos/bram",
    who: "Bram, Human male innkeeper",
    look: "A burly, barrel-chested innkeeper in his fifties, about 1.85 m tall, with tall human proportions and long legs, not a dwarf. Curly grey-brown hair to the collar, a big curled grey moustache and a short grey beard, ruddy cheeks, jovial creased eyes and a warm grin. A brown leather waistcoat with brass buttons and tooled trim over a loose white linen shirt with the sleeves rolled to the elbow, a long stained canvas apron tied at the waist, a cloth over one shoulder, dark trousers and boots.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726055418469",
    head: 0.13,
  },
  beric: {
    out: "fixtures/march-of-davos/beric",
    who: "Beric Sonacus, Human male dockworker",
    look: "A burly, broad-shouldered dockworker in his forties, about 1.86 m tall, with tall human proportions and long legs, not a dwarf. Short dark tousled hair, heavy dark stubble, a weathered sun-darkened face with a deep old scar running diagonally across it, hard hazel eyes. A worn dark-brown leather coat with a high collar and stitched trim, a dark wool shirt, a wide belt with an iron cargo hook, rough trousers tucked into heavy boots. Big working hands at his sides.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726093177133",
    head: 0.13,
  },
  eamon: {
    out: "fixtures/march-of-davos/eamon",
    who: "Eamon Drakovan, Half-Elf male scholar",
    look: "A slender, slightly frail half-elf man who looks about sixty, about 1.78 m tall. Pointed ears, short swept grey hair, a neat white beard, sharp features, keen pale eyes behind round wire spectacles. A long worn ochre-gold scholar's robe trimmed with dark fur over a dark coat, a cream shirt with a loose cravat, a leather satchel of papers at his hip, a book held against his side, soft boots.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726093191207",
    head: 0.13,
    backNote:
      "In image 1 the satchel hangs at the left of the picture and the book is held at the right of the picture. Seen from behind they swap: the satchel hangs at the RIGHT of the picture and the book shows at the LEFT of the picture, partly hidden by his body.",
  },
  elara: {
    out: "fixtures/march-of-davos/elara",
    who: "Elara Antonov, Human female courier",
    look: "A slight young woman of about twenty, about 1.65 m tall. Long dark-brown hair, tousled, loose strands falling over her face, pale skin, tired grey-green eyes red-rimmed from crying, tear-streaked cheeks, a worried frown. A loose white linen blouse with full sleeves under a dark brown laced bodice, a long dark skirt, a small round gold pendant on a cord, a thin bracelet, worn shoes. A small leather scroll case held in one hand.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726111995012",
    head: 0.13,
  },
  bard: {
    out: "fixtures/march-of-davos/bard",
    who: "The Dragonbone's bard, Human male minstrel",
    look: "A lanky man in his late twenties, about 1.8 m tall, with a cheerful face, a short dark beard and wavy chestnut hair under a soft green cap with a pheasant feather. A patched crimson doublet with slashed sleeves over a cream shirt, a short green cloak thrown back over one shoulder, brown hose and soft boots. Playing a pear-shaped wooden lute held across his body, one hand on its neck and the other on the strings.",
    head: 0.13,
  },
  "patron-merchant": {
    out: "fixtures/march-of-davos/patron-merchant",
    who: "A merchant at the inn, Human male",
    look: "A stout, prosperous merchant in his fifties with a bald crown, grey side hair and a forked grey beard, a ruddy face mid-laugh. A wine-red wool coat with fur trim over a mustard doublet, a heavy belt purse, rings on his fingers. A pewter tankard in his right hand resting on his knee.",
    head: 0.17,
    seated: true,
  },
  "patron-traveller": {
    out: "fixtures/march-of-davos/patron-traveller",
    who: "A traveller at the inn, Human female",
    look: "A weathered woman traveller in her forties with grey-streaked auburn hair tied back, a tired kind face. A hooded brown travelling cloak thrown back over a moss-green wool dress, a leather satchel, dusty boots. A wooden bowl of stew in her lap and a spoon in her right hand.",
    head: 0.17,
    seated: true,
    backNote:
      "Seen squarely from directly behind, not turned: her back faces the camera straight on, the back of her head centred above it, no cheek or profile showing. In image 1 her knees angle toward the left of the picture, so from behind they angle toward the RIGHT of the picture. The bowl and spoon are hidden in front of her.",
  },
  "patron-farmer": {
    out: "fixtures/march-of-davos/patron-farmer",
    who: "A farmer at the inn, Human male",
    look: "An old farmer in his sixties, lean and weathered, white stubble, a flat grey wool cap, deep laugh lines. A patched brown smock over a cream shirt, a rope belt, mud-stained trousers and old boots. A long clay pipe in his right hand.",
    head: 0.17,
    seated: true,
  },
  "patron-sailor": {
    out: "fixtures/march-of-davos/patron-sailor",
    who: "A river sailor at the inn, Human male",
    look: "A young river sailor in his twenties with sun-browned skin, a short dark beard and a gold ring in one ear. A blue knitted cap, a faded red-and-cream striped shirt under an open oilskin vest, a sash, canvas trousers rolled at the calf, bare forearms with a faded tattoo. A pewter tankard held up in his right hand.",
    head: 0.17,
    seated: true,
  },
  "patron-hooded": {
    out: "fixtures/march-of-davos/patron-hooded",
    who: "A hooded stranger at the inn, Human male",
    look: "A lean, watchful man whose deep charcoal hood shadows his face down to a stubbled jaw, a thin mouth and the glint of narrow eyes. A dark wool cloak wrapped close, worn black leather gloves, the hilt of a long dagger at his belt, dark boots. Hunched forward with his elbows on his knees, a small clay cup held in both hands.",
    head: 0.17,
    seated: true,
    backNote:
      "Seen from directly behind: his hood is up and covers the whole back of his head, and the cloak hangs straight down his back to the stool and hides his back. His hands, the cup, the dagger and his knees are in front of him and NOT visible. Below the cloak only the stool's legs, the backs of his calves and the heels of his boots show.",
  },
  "patron-hooded-b": {
    out: "fixtures/march-of-davos/patron-hooded-b",
    who: "A cloaked stranger at the inn, Human female",
    look: "A slim woman in a dusty dark-green cloak with the hood up, a narrow pale face, sharp dark eyes glancing to one side, a thin scar on her chin. Arms folded under the cloak, dark leather trousers and soft boots.",
    head: 0.17,
    seated: true,
    backNote:
      "Seen from directly behind: her hood is up and covers the whole back of her head, and the cloak hangs straight down her back to the stool and hides her back and arms. Her knees and thighs are in front of her and NOT visible. Below the cloak only the stool's legs, the backs of her calves and the heels of her boots show.",
  },
  // March of Davos, the Old Grand Library: Sister Danica from her portrait, the archivist, and two readers.
  "sister-danica": {
    out: "fixtures/march-of-davos/sister-danica",
    who: "Sister Danica, Human female cleric of Thyra",
    look: "A serene woman in her thirties, about 1.7 m tall, with long dark-brown hair in an intricate braid over one shoulder, calm dark eyes, a gentle, knowing smile. Long flowing robes of deep blue-grey wool with a cream inner robe, a silver-embroidered stole, wide sleeves, a corded belt. A silver pendant on a chain: a tree intertwined with a crescent moon, the symbol of Thyra. Hands folded before her.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726275370282",
    head: 0.13,
  },
  "eldrin-varokich": {
    out: "fixtures/march-of-davos/eldrin-varokich",
    who: "Eldrin Varokich, Human male archivist",
    look: "An elderly, slightly stooped man of about seventy, about 1.72 m tall, with a pale, lined face, thin wispy grey hair combed back from a high forehead, keen watchful grey eyes and a faint wary smile. Simple long robes of faded charcoal-brown wool with a cream stole embroidered with the old Valkaran sun-and-oak symbol, a rope belt with a ring of iron keys, a pair of wire spectacles hanging on a cord around his neck. Hands clasped behind his back.",
    head: 0.13,
  },
  "reader-scholar": {
    out: "fixtures/march-of-davos/reader-scholar",
    who: "An old scholar in the library, Human male",
    look: "A white-bearded old scholar in his seventies with a bald head, half-moon spectacles on his nose, absorbed in reading. A long plum-coloured scholar's gown with black velvet trim over a grey robe, soft slippers. A large open leather-bound book held in his lap with both hands.",
    head: 0.17,
    seated: true,
  },
  "reader-acolyte": {
    out: "fixtures/march-of-davos/reader-acolyte",
    who: "A young acolyte of Thyra in the library, Human female",
    look: "A young woman acolyte of about seventeen with short dark-blonde hair under a plain grey coif, ink-stained fingers, a studious frown. A simple undyed cream novice's robe with a grey tabard, a small wooden tree pendant. Writing with a quill on a wax-sealed scroll held on a board across her knees.",
    head: 0.17,
    seated: true,
  },
}
for (const [id, f] of Object.entries(FIGURES)) f.out ||= `heroes/${id}`

const ART = `Art direction (critical):
- A finished, richly detailed PAINTED character illustration in the painterly manner of the game world screenshot (oil-painting brushwork, muted earthy palette), with the detail of a hand-finished character portrait.
- FACE: carefully painted and expressive. Clear eyes with visible irises, defined brows, nose and mouth, a readable expression, natural skin modelling.
- HANDS: readable, well-drawn hands with individual fingers.
- COSTUME AND GEAR: visible fabric weave, stitching, folds, worn leather and metal. Every prop reads as a distinct object.
- VISIBLE PAINTERLY BRUSHWORK throughout. MUTED, earthy palette: umber, ochre, dusty navy, olive, sage, warm stone. No saturated or neon colours.
- LIGHTING: soft neutral daylight from the upper left, gentle even modelling, no rim light, no vignette.
- NO OUTLINE of any kind: no ink line, no dark contour, no rim glow, no halo. NO cast shadow and no ground contact shadow.
- NOT photorealistic, NOT cartoon, NOT chibi, NOT a 3D render.
- POSE
- Background: SOLID UNIFORM PURE GREEN (#00FF00) everywhere, edge to edge. No scenery, no ground, no text, no border, no logo. One character only.`

const STANDING =
  "- Pose: full body, head to toe, standing, facing straight toward the camera in a relaxed front-facing stance, eye-level view without perspective distortion, hands relaxed or holding gear close to the body. Nothing cropped, about 6% margin on all sides, feet flat near the bottom of the frame."
const SEATED =
  "- Pose: full body, head to toe, SITTING on a plain round three-legged wooden tavern stool about 45 cm high, which is drawn, facing straight toward the camera, knees forward, feet flat on the floor in front of the stool, eye-level view without perspective distortion. No table and no other furniture. Nothing cropped, about 6% margin on all sides, the feet and the stool's feet near the bottom of the frame."

const frontPrompt = (f: Figure) =>
  `${
    f.ref
      ? "Three reference images are provided. Image 1 is the character's existing portrait: use it for face, hair, colouring, costume and mood, painted as an original character rather than a photographic likeness. Image 2 is a finished standee from this game: match its finish and detail only, it is a different character. Image 3 is a screenshot of the painted game world: it is the art direction."
      : "Two reference images are provided. Image 1 is a finished standee from this game: match its finish and detail only, it is a different character. Image 2 is a screenshot of the painted game world: it is the art direction."
  }

Character: ${f.who}
Appearance: ${f.look}

${ART.replace("- POSE", f.seated ? SEATED : STANDING)}`

const BACK = `Two reference images are provided. Image 1 is the finished FRONT view of a character. Image 2 is a screenshot of a painted game world: it is the ART DIRECTION to match.

Render the SAME character seen from directly behind: same outfit, colours, gear, hair and proportions; back of head, no face visible; same standing pose from behind; same painted finish, light and palette; full body head to toe with margins; solid green background; no outline, no ground shadow. It is the exact figure of image 1 as if the camera walked 180 degrees around it while it stood frozen.

Requirements:
- Match image 1 in silhouette, height, build, stance and footprint. Whatever is held stays in the same hand (the figure's own left and right are unchanged, so from behind they swap sides on screen). A cloak, pack, quiver, hood or hair continues plausibly from the front design, as carefully finished as the front.
- The head is seen from behind. No face, no profile, no glance over the shoulder.
- Same painterly manner as image 1: oil-painting brushwork, muted earthy palette. Soft neutral daylight from the upper left. NOT photorealistic, NOT cartoon, NOT a 3D render.
- NO outline of any kind and NO cast shadow on the ground.
- Full body, head to toe, standing, eye-level view, nothing cropped, about 6% margin on all sides, feet flat near the bottom of the frame.
- Background: SOLID UNIFORM PURE GREEN (#00FF00) everywhere, edge to edge. No scenery, no text, no border, no logo. One character only.`

const jpeg = async (input: Buffer | string, bg: string) => (await sharp(input).flatten({ background: bg }).jpeg({ quality: 90 }).toBuffer()).toString("base64")
async function render(label: string, text: string, images: string[]) {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set")
  const body = JSON.stringify({
    contents: [{ parts: [{ text }, ...images.map((data) => ({ inline_data: { mime_type: "image/jpeg", data } }))] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "9:16", imageSize: "2K" } },
  })
  const call = () =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body })
  let res = await call()
  // Rate limits and high demand return no image and are not billed: wait and retry.
  for (let tries = 0; (res.status === 429 || res.status === 503) && tries < 5; tries++) {
    console.log(`${label}: HTTP ${res.status}, retrying`)
    await new Promise((r) => setTimeout(r, 10_000 * (tries + 1)))
    res = await call()
  }
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${(await res.text()).slice(0, 200).replaceAll(key, "***")}`)
  const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string }; inline_data?: { data?: string } }[] } }[] }
  const data = json.candidates?.[0]?.content?.parts?.map((p) => p.inlineData?.data ?? p.inline_data?.data).find(Boolean)
  if (!data) throw new Error(`${label}: no image in the response`)
  return Buffer.from(data, "base64")
}

async function latest(kind: "front" | "back", id: string) {
  // Numbered files only: `barok` must not count `barok-bruiser`'s renders.
  const files = (await readdir(RAW)).filter((f) => f.startsWith(`${kind}-${id}-`) && /^\d+\.png$/.test(f.slice(`${kind}-${id}-`.length)))
  const n = Math.max(0, ...files.map((f) => Number(f.slice(`${kind}-${id}-`.length, -4))))
  return { n, path: join(RAW, `${kind}-${id}-${n}.png`) }
}
async function keep(kind: "front" | "back", id: string, png: Buffer) {
  const { n } = await latest(kind, id)
  const path = join(RAW, `${kind}-${id}-${n + 1}.png`)
  await writeFile(path, png)
  await appendFile(join(RAW, "generations.log"), `${new Date().toISOString()} ${kind} ${id} #${n + 1} ${MODEL}\n`)
  console.log(`${kind} ${id} #${n + 1}`)
}

async function front(id: string) {
  const f = FIGURES[id]
  const ref = f.ref ? [await jpeg(Buffer.from(await (await fetch(f.ref)).arrayBuffer()), "#8a8a8a")] : []
  await keep("front", id, await render(id, frontPrompt(f), [...ref, await jpeg(FINISH, "#8a8a8a"), await jpeg(STYLE, "#000")]))
}
async function back(id: string) {
  const { path } = await latest("front", id)
  if (!existsSync(path)) throw new Error(`No front for ${id}. Run front first.`)
  const note = FIGURES[id].backNote
  const seated = FIGURES[id].seated
    ? `${BACK.replaceAll("standing pose", "seated pose").replace("Full body, head to toe, standing", "Full body, head to toe, sitting on the same stool")}\n- The figure sits on the same three-legged stool, seen from behind.`
    : BACK
  await keep("back", id, await render(`${id} back`, note ? `${seated}\n- ${note}` : seated, [await jpeg(path, "#00ff00"), await jpeg(STYLE, "#000")]))
}

// Distance-from-green key (olive cloaks survive), eroded two pixels and despilled at the edge, cropped to the figure.
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
async function cutout(path: string) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  for (let i = 0; i < data.length; i += 4) data[i + 3] = Math.round(255 * (1 - smooth(45, 125, data[i + 1] - Math.max(data[i], data[i + 2]))))
  let alpha = new Uint8Array(W * H).map((_, p) => data[p * 4 + 3])
  for (let pass = 0; pass < 2; pass++) {
    const src = alpha
    alpha = src.map((v, p) => {
      const x = p % W
      const y = (p - x) / W
      let m = v
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          const yy = y + dy
          m = xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : Math.min(m, src[yy * W + xx])
        }
      return m
    })
  }
  let [minX, minY, maxX, maxY] = [W, H, 0, 0]
  for (let p = 0; p < W * H; p++) {
    const i = p * 4
    data[i + 3] = alpha[p]
    if (alpha[p] < 250) data[i + 1] = Math.min(data[i + 1], Math.max(data[i], data[i + 2]))
    if (alpha[p] > 40) {
      const x = p % W
      const y = (p - x) / W
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX <= minX) throw new Error(`Empty cutout: ${path}`)
  const pad = 6
  const left = Math.max(0, minX - pad)
  const top = Math.max(0, minY - pad)
  const region = { left, top, width: Math.min(W - left, maxX - minX + 2 * pad), height: Math.min(H - top, maxY - minY + 2 * pad) }
  return sharp(
    await sharp(data, { raw: { width: W, height: H, channels: 4 } })
      .extract(region)
      .png()
      .toBuffer()
  )
}
async function key(id: string) {
  const f = FIGURES[id]
  const out = join(STAGE, f.out)
  await mkdir(join(out, ".."), { recursive: true })
  const fr = await cutout((await latest("front", id)).path)
  await fr.clone().resize({ height: 2048, fit: "inside", withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100, effort: 5 }).toFile(`${out}-front.webp`)
  const bk = await cutout((await latest("back", id)).path)
  await bk.resize({ height: 2048, fit: "inside", withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100, effort: 5 }).toFile(`${out}-back.webp`)
  // Head and shoulders, centred on the head: the alpha-weighted middle of the figure's top rows.
  const { data, info } = await fr.clone().raw().toBuffer({ resolveWithObject: true })
  const rows = Math.round(info.height * f.head * 0.8)
  let [sum, weight] = [0, 0]
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < info.width; x++) {
      const a = data[(y * info.width + x) * 4 + 3]
      sum += a * x
      weight += a
    }
  const h = Math.round(info.height * f.head * 2.3)
  const w = Math.round(h * 1.27)
  const cx = Math.round(sum / weight)
  const left = cx - Math.round(w / 2)
  const top = -Math.round(info.height * 0.02)
  const extend = { top: Math.max(0, -top), left: Math.max(0, -left), right: Math.max(0, left + w - info.width), bottom: 0, background: PORTRAIT_BG }
  const padded = await fr.clone().extend(extend).flatten({ background: PORTRAIT_BG }).toBuffer()
  await sharp(padded)
    .extract({ left: Math.max(0, left), top: Math.max(0, top), width: w, height: h })
    .resize({ width: 512 })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(`${out}-portrait.jpg`)
  console.log(`keyed ${id} -> ${out}-{front,back}.webp, portrait`)
}

async function main() {
  const [cmd, list] = process.argv.slice(2)
  const ids = list ? list.split(",") : Object.keys(FIGURES)
  for (const id of ids) if (!FIGURES[id]) throw new Error(`Unknown figure ${id}`)
  await mkdir(RAW, { recursive: true })
  // Four at a time keeps clear of the image model's rate limit.
  async function each(fn: (id: string) => Promise<void>) {
    const queue = [...ids]
    const failed: string[] = []
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let id = queue.shift(); id; id = queue.shift())
          await fn(id).catch((error) => {
            failed.push(id)
            console.log(String(error))
          })
      })
    )
    if (failed.length) console.log(`failed: ${failed.join(",")}`)
  }
  if (cmd === "front") await each(front)
  else if (cmd === "back") await each(back)
  else if (cmd === "key") await each(key)
  else if (cmd === "all")
    await each(async (id) => {
      await front(id)
      await back(id)
      await key(id)
    })
  else console.log("usage: stage-standees.ts front|back|key|all [id,...]")
}
void main()
