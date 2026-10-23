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
// `pose` replaces the standing pose (a creature on all fours). `magenta` paints and keys on magenta instead of green, for a
// green subject (a mossy drake).
// `hue` turns the keyed figure's colours by that many degrees, as when a painting came back warmer than the text.
// `chair` seats a `seated` figure on that chair instead of the stool (an auction's velvet chairs).
type Figure = { out: string; who: string; look: string; ref?: string; head: number; backNote?: string; seated?: boolean; chair?: string; pose?: string; magenta?: boolean; hue?: number }
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
  // March of Davos, the Silver Serpent: Harron the bartender, the dockworkers, and a smuggler.
  harron: {
    out: "fixtures/march-of-davos/harron",
    who: "Harron, Human male bartender",
    look: "A grizzled man in his fifties, about 1.8 m tall, with tall human proportions and long legs, not a dwarf. Deep-set hard grey eyes under heavy brows, a long pale scar running down his left cheek, cropped iron-grey hair, grey stubble, an unreadable weathered face. A faded dark-blue sailor's shirt with the sleeves rolled up over tattooed forearms, a stained leather apron, a wide belt, dark trousers and sea boots. Wiping a pewter tankard with a rag.",
    head: 0.13,
    backNote:
      "The apron is tied on at the front: from behind only its neck strap and the waist ties show over the back of the blue shirt, and his dark trousers show below. The tankard and rag are in front of him and NOT visible.",
  },
  "dockworker-boss": {
    out: "fixtures/march-of-davos/dockworker-boss",
    who: "A burly dockworker at the tavern, Human male",
    look: "A big, burly dockworker in his forties with arms thick with muscle, a patchy brown beard, a broken nose, small suspicious eyes and a weather-beaten red face. A sweat-stained sleeveless grey linen shirt under an open leather vest, a cargo hook on his belt, rough canvas trousers, heavy boots. Leaning back, a pewter tankard of ale held in his right hand resting on his thigh.",
    head: 0.17,
    seated: true,
  },
  "dockworker-a": {
    out: "fixtures/march-of-davos/dockworker-a",
    who: "A dockworker at the tavern, Human male",
    look: "A lean, wiry dockworker in his thirties with a gaunt weather-beaten face, a shaved head, a short black beard and wary narrow eyes. A patched brown wool jerkin over a dirty cream shirt, a knitted grey scarf, rough trousers, worn boots. Hunched forward, both calloused hands round a clay mug of ale.",
    head: 0.17,
    seated: true,
  },
  "dockworker-b": {
    out: "fixtures/march-of-davos/dockworker-b",
    who: "A dockworker at the tavern, Human female",
    look: "A strong, broad-shouldered woman dockworker in her thirties with a sunburnt freckled face, red hair tied back under a stained kerchief, a hard, guarded stare. A rolled-sleeve olive canvas shirt, a heavy leather apron, a rope coiled over one shoulder, rough trousers, boots. A pewter tankard held in both hands on her knee.",
    head: 0.17,
    seated: true,
  },
  smuggler: {
    out: "fixtures/march-of-davos/smuggler",
    who: "A smuggler at the tavern, Human male",
    look: "A rakish smuggler captain in his forties, about 1.84 m tall, with tall human proportions and long legs, not a dwarf. A black tricorn hat, long dark hair tied back, a sharp trimmed beard, a sly half smile, a gold earring. A long weathered brown greatcoat with wide cuffs over a dark red waistcoat and a loose white shirt, a baldric with a cutlass, a sash, high boots. Holding a pewter tankard raised in one hand.",
    head: 0.13,
  },
  // March of Davos, the docks: Finn and his crew from their portraits, Alaric and his hired blades, Lady Astrid from her
  // painting, and the forest drake from the text (wings, mossy green and bark-brown, yellow eyes).
  "loric-windrider": {
    out: "fixtures/march-of-davos/loric-windrider",
    who: "Finn Radonik, Human male dock foreman",
    look: "A grizzled dock veteran in his late fifties, about 1.8 m tall, with tall human proportions and long legs, not a dwarf. A deeply sun-worn, weathered face, close-cropped grey hair, a short grey beard, squinting wary eyes. A heavy scuffed leather apron over a sweat-stained rough linen shirt with rolled sleeves, thick forearms, a wide belt with a cargo hook, canvas trousers and heavy boots. A pair of leather work gloves tucked in his belt.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726344098147",
    head: 0.13,
    backNote:
      "An apron is worn on the FRONT only. From behind it shows only its thin neck strap and the waist ties knotted at the small of the back, over the shirt: NO apron bib, panel or pocket on the back. The back of the shirt and the seat of the trousers show.",
  },
  "tor-marros": {
    out: "fixtures/march-of-davos/tor-marros",
    who: "Tor Marros, Human male dockworker called The Bull",
    look: "A towering, heavily muscled man in his early forties, about 2.0 m tall, with tall human proportions and long legs. Bald head, a thick neck, a heavy brow and a short dark beard. A sleeveless faded brown tunic showing massive arms covered in crude dark tattoos of animals and mythical beasts, a broad leather belt, rough trousers and boots. A coil of heavy rope over one shoulder.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726344982001",
    head: 0.12,
  },
  "petra-velan": {
    out: "fixtures/march-of-davos/petra-velan",
    who: "Petra Velan, Human female dock hand",
    look: "A strong woman in her mid-forties, about 1.68 m tall, with short steel-grey hair tied back in a small ponytail, tanned weathered skin, sharp wary eyes. A patched cream shirt with rolled sleeves under a worn leather apron, heavy work boots, a metal brace strapped on her right leg over her trousers. A short clay pipe in her hand.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726344936638",
    head: 0.13,
    backNote:
      "An apron is worn on the FRONT only. From behind it shows only its thin neck strap and the waist ties knotted at the small of the back, over the shirt: NO apron bib, panel or pocket on the back. The back of the shirt and the seat of the trousers show.",
  },
  "scarface-alaric": {
    out: "fixtures/march-of-davos/scarface-alaric",
    who: "Alaric Fleyven, Human male rogue",
    look: "A tall, lean man in his thirties, about 1.85 m tall, with jet-black hair tied back in a ponytail, piercing blue eyes and a deep jagged scar running down his cheek, a sneer. A plain worn dockworker's tunic of grey-brown wool over dark leather, a dark sash, a belt with knives, dark trousers and soft boots. A short sword drawn and held low in his right hand.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726346336662",
    head: 0.13,
  },
  "warehouse-thug": {
    out: "fixtures/march-of-davos/warehouse-thug",
    who: "A warehouse thug, Human male mercenary",
    look: "A thickset hired blade in his thirties with a shaved head, a broken nose and heavy stubble. A sweat-stained work tunic worn over a hidden leather jerkin, rolled sleeves, a dark neckerchief, canvas trousers and boots. A short sword drawn in his right hand.",
    head: 0.13,
  },
  "thug-b": {
    out: "fixtures/march-of-davos/thug-b",
    who: "A warehouse thug, Human male mercenary",
    look: "A wiry young hired blade with greasy shoulder-length brown hair, a thin moustache and a cruel smirk. A loose dockworker's smock over a studded leather vest, a red cloth tied round one arm, patched trousers, boots. A short sword drawn in his left hand and a dagger in his right.",
    head: 0.13,
  },
  "thug-c": {
    out: "fixtures/march-of-davos/thug-c",
    who: "A warehouse thug, Human female mercenary",
    look: "A broad-shouldered woman mercenary in her thirties with cropped red hair and a scarred lip. A grey dockworker's tunic open over a leather jerkin, bracers, a broad belt, trousers and boots. A short sword drawn and held ready in her right hand.",
    head: 0.13,
  },
  "astrid-blackthorn": {
    out: "fixtures/march-of-davos/astrid-blackthorn",
    who: "Lady Astrid Blackthorn, Human female noble ranger",
    look: "A tall young noblewoman in her mid-twenties, about 1.78 m tall, with a sharp, striking, commanding face, intense forest-green eyes, and long wild windblown black hair. Rugged fitted black leather armour with a high collar, gilt-edged pauldrons and a gilt trim, leather bracers, a quiver strap across her chest, a longbow slung on her back, dark trousers and tall boots. A curved sabre drawn and held lowered in her right hand.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726361535587",
    head: 0.13,
  },
  "astrid-letter": {
    out: "fixtures/march-of-davos/astrid-letter",
    who: "Lady Astrid Blackthorn, Human female noble ranger",
    look: "A tall young noblewoman in her mid-twenties, about 1.78 m tall, with a sharp, striking, commanding face, intense forest-green eyes, and long wild windblown black hair. Rugged fitted black leather armour with a high collar, gilt-edged pauldrons and a gilt trim, leather bracers, a quiver strap across her chest, a longbow slung on her back, a curved sabre sheathed at her hip, dark trousers and tall boots. Holding out a small cream envelope sealed with black wax in her right hand.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726361535587",
    head: 0.13,
    backNote:
      "There is only ONE envelope, held in her right hand, which from behind shows at the RIGHT of the picture. Her other hand is empty. The sheathed sabre hangs at her left hip, which from behind is at the LEFT of the picture.",
  },
  "forest-drake": {
    out: "fixtures/march-of-davos/forest-drake",
    who: "A forest drake, a wild wingèd dragon-kin beast from the elven forests",
    look: "A massive four-legged drake the size of a horse, heavy and low like a great lizard, with a long thick tail, a crocodilian head with a gaping jaw of jagged teeth, burning yellow eyes and a crest of bony spines. Mossy green and bark-brown scales, lichen and moss growing in the hollows, a paler belly. A pair of leathery bat-like wings, mottled brown and green, half-raised and spread above its back. Iron shackle fragments on one foreleg.",
    head: 0.3,
    pose: "the whole creature, head to tail, standing on all four legs and rearing its chest up with the head raised and roaring, facing toward the camera at a slight three-quarter angle, wings half-raised above its back, tail curled tightly round in front of its feet, wings only half-raised and kept close so they fit. The WHOLE creature is small enough in the frame to leave a wide margin, at least 10% of empty background on every side: no wing tip, tail or claw touches or crosses the edge. Eye-level view.",
    magenta: true,
    // The model paints it gold-brown, which turns orange in the docks' low sun; the text says mossy green.
    hue: 40,
    backNote:
      "The creature is seen squarely from directly behind, its rump and tail nearest the camera: its back, the row of spines along it, both wings from behind and the thick tail curling at the bottom. The head points AWAY from the camera, so only the back of the skull and the crest show above the shoulders: NO eyes, NO jaws, NO face, NO profile. Same size and stance.",
  },
  // March of Davos, the Lower Districts: the halfling urchins from their portraits, two more of their gang, a street
  // fiddler, a wary hooded local and a fence lurking in a doorway.
  "finn-swiftfoot": {
    out: "fixtures/march-of-davos/finn-swiftfoot",
    who: "Finn Swiftfoot, Halfling boy pickpocket",
    look: "A halfling urchin only about 1.0 m tall, a child-sized body with a wide-eyed, mischievous boyish face of about twelve, small pointed ears, very messy shaggy dark-brown hair, rosy grubby cheeks and a gap-toothed grin. A too-big patched cream shirt with rolled sleeves under a frayed dark-brown waistcoat, a rope belt with a little pouch, ragged brown knee breeches, bare dirty feet. Leaning forward mid-step as if about to dart away, one hand tucked behind his back.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726439716482",
    head: 0.2,
  },
  "mara-redleaf": {
    out: "fixtures/march-of-davos/mara-redleaf",
    who: "Mara Redleaf, Halfling girl urchin and musician",
    look: "A halfling girl only about 1.0 m tall, a child-sized body with the face of a sly girl of about fourteen, small pointed ears, long tangled copper-red hair with a few thin braids, a freckled face with dirt-smudged cheeks and a knowing smile. A faded mustard-ochre blouse, a ragged grey hooded cloak thrown back, a small brass pendant on a cord, a patched brown skirt over leggings, scuffed little boots. A small wooden penny-whistle in one hand, skipping on her toes.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726439437517",
    head: 0.2,
  },
  "urchin-a": {
    out: "fixtures/march-of-davos/urchin-a",
    who: "A halfling street urchin, boy",
    look: "A halfling boy only about 0.95 m tall, a child-sized body and a cheeky round face of about ten, small pointed ears, a cropped mop of sandy hair under a floppy too-big grey wool cap, a smudged nose. A ragged moss-green tunic tied with string, patched grey trousers rolled to the knee, bare feet. Clutching a stolen apple to his chest and laughing.",
    head: 0.2,
  },
  "urchin-b": {
    out: "fixtures/march-of-davos/urchin-b",
    who: "A halfling street urchin, girl",
    look: "A halfling girl only about 0.95 m tall, a child-sized body and a sharp little face of about eleven, small pointed ears, black hair in two scruffy short plaits, big dark eyes. An oversized faded rust-red coat with the sleeves hanging past her hands, a dirty cream smock beneath, bare feet. Peeking over her shoulder, one finger to her lips.",
    head: 0.2,
  },
  fiddler: {
    out: "fixtures/march-of-davos/fiddler",
    who: "A street fiddler in the Lower Districts, Human male",
    look: "A gaunt old street musician of about sixty, about 1.75 m tall, long lank grey hair under a battered wide-brimmed felt hat, a hollow-cheeked weathered face with a grey stubble, eyes half closed as he plays. A long threadbare dark-green coat patched at the elbows, a faded red scarf, worn grey breeches and cracked boots. Playing a battered old fiddle tucked under his chin with a bow.",
    head: 0.13,
  },
  "hooded-local": {
    out: "fixtures/march-of-davos/hooded-local",
    who: "A wary local of the Lower Districts, Human female",
    look: "A wary middle-aged woman, about 1.65 m tall, a pinched pale face peering out from a deep dark-brown wool hood, grey hair escaping it, suspicious narrowed eyes. A heavy patched brown cloak clutched closed with one hand, a covered wicker basket on her other arm, muddy hem, worn clogs.",
    head: 0.13,
    backNote: "Her deep hood is up and covers the whole back of her head. The cloak hangs straight down her back to the calves and hides it. The basket shows only at her side.",
  },
  fence: {
    out: "fixtures/march-of-davos/fence",
    who: "A suspicious street merchant of the Lower Districts, Human male",
    look: "A lean shifty man of about forty, about 1.78 m tall, tall human proportions, a narrow sallow face with a thin moustache and a gold tooth, slicked-back black hair under a wide-brimmed black hat. A long dark-plum coat over a stained mustard waistcoat, rings on his fingers, a tray of cheap trinkets and charms hung from a strap round his neck, worn boots. A sly half-smile, one hand beckoning.",
    head: 0.13,
    backNote:
      "The tray of trinkets hangs on his CHEST in front of him and is NOT visible from behind: only its strap shows, crossing the back of his neck. His back shows the long plain plum coat from collar to hem with nothing hung on it, no bag, no pouches, no charms. His hands are at his sides.",
  },
  // March of Davos, the Black Market: the doorkeeper and the dealers from their portraits, and the fence of the elven goods.
  garrick: {
    out: "fixtures/march-of-davos/garrick",
    who: "Garrick, Human male doorkeeper of the Black Market",
    look: "A huge, broad-shouldered man about 1.95 m tall, with tall human proportions and long legs, not a dwarf. A deep, ragged grey-green hood shadows his face down to a heavy jaw, a hard scowling mouth and the glint of narrow eyes; a flat broken nose. A long tattered charcoal cloak over worn dark leather armour with straps and buckles, a wide belt with a long dagger tucked in plain view, dark leather bracers and gloves, heavy boots. Arms crossed over his chest.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726436888924",
    head: 0.13,
    backNote:
      "Seen from directly behind: his hood is up and covers the whole back of his head. The tattered cloak is CLOSED behind him: one unbroken sheet of grey-green cloth from the shoulders straight down to the calves covering his whole back, so NO leather armour, straps, belt or pouches show. His crossed arms and the dagger are in front of him and NOT visible. Only the backs of his boots show below the cloak's ragged hem.",
  },
  "grendel-one-eye": {
    out: "fixtures/march-of-davos/grendel-one-eye",
    who: "Grendar One-Eye, Human male trinket dealer",
    look: "A grizzled man in his fifties, about 1.8 m tall, with wild greying dark hair, a short grey-streaked beard, a scarred face with a cut across one brow and a cloudy, scarred eye, a wide crooked grin full of teeth and wild eyes. A black coat over a red-and-gold brocade tunic with a gilt-trimmed collar, big brass amulets and chains round his neck, rings on his fingers, a worn belt with pouches. Leaning a little forward with one hand held out, palm up, offering a trinket.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726436104061",
    head: 0.13,
  },
  "vera-azimov": {
    out: "fixtures/march-of-davos/vera-azimov",
    who: "Vera Azimov, Dwarf female weapon dealer",
    look: "Very short and very broad, about 1.35 m tall, with stout dwarf proportions, not a short human. A heavy-set dwarf woman with thick curly brown hair tied back messily, small pointed ears, a round weathered face, heavy brows and a stern, proud look. A tattered mustard-yellow cloak over a quilted brown leather jerkin, heavy belts with a row of sheathed knives, leather bracers, sturdy boots. Holding up an intricately carved dagger in her right hand to show it off.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726438484598",
    head: 0.17,
  },
  "rae-the-scarred": {
    out: "fixtures/march-of-davos/rae-the-scarred",
    who: "Rae the Scarred, Human female rogue",
    look: "A slim young woman of about twenty, about 1.68 m tall, with short messy black hair falling over her forehead, sharp grey eyes, a small thin scar across her chin and a confident smirk. Rugged dark-green and black adventurer's leathers, a hooded short cloak thrown back, a few thin cords and a small pendant at her throat, fingerless gloves, a long knife at her hip, dark trousers and soft boots. Walking with a relaxed swagger, thumbs hooked in her belt.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726439232056",
    head: 0.13,
  },
  "mizrith-the-cackler": {
    out: "fixtures/march-of-davos/mizrith-the-cackler",
    who: "Mizrith the Cackler, a hunched old goblin-kin peddler",
    look: "A small hunched old figure only about 1.3 m tall, with long pointed ears, a big hooked nose, bushy white eyebrows, a wild white beard and straggly hair, purple marks on his forehead, and an enormous gleeful grin. A mix of colourful rags: a mustard-yellow patched coat, a purple and red sash, a blue shawl, strings of beads, bones and amulets round his neck, heavy rings on bony fingers. Hunched forward, beckoning with one bony hand.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726438466481",
    head: 0.2,
    backNote:
      "Both his hands are in front of him and NOT visible from behind: no hand, fingers or rings show at his back or sides. We see the back of the patched yellow coat, the sash's knot, the shawl's ends hanging down his back, and his wild white hair and pointed ears.",
  },
  "oily-vendor": {
    out: "fixtures/march-of-davos/oily-vendor",
    who: "An oily fence at the Black Market, Human male",
    look: "A thin, sallow man in his forties with slicked-back black hair, a pencil moustache, small beady eyes and a nervous ingratiating smile. A shiny dark-green velvet coat gone shabby at the cuffs over a stained cream shirt, a gold earring, too many rings. His fingers steepled and twitching in front of his chest.",
    head: 0.17,
    seated: true,
    backNote:
      "Seen squarely from directly behind, sitting on the stool facing AWAY from us. The back of his green velvet coat covers his whole back from the collar down over the stool; its tails hang down behind. His shirt, chest, hands, thighs and knees are in front of him and NOT visible. Below the coat only the stool's legs, the backs of his calves and the heels of his boots show.",
  },
  // March of Davos, the auction: the masked auctioneer and his assistant, Silverhand seated and standing, his
  // representative and a guard, and masked bidders in velvet chairs.
  auctioneer: {
    out: "fixtures/march-of-davos/auctioneer",
    who: "The masked auctioneer of the Black Market, Human male",
    look: "A tall, slim man in his fifties, about 1.88 m tall, with swept-back iron-grey hair, a lean clean-shaven face, a sly knowing smile, and a black leather half-mask over his eyes tied behind his head. A long flowing black robe with a deep cowl lying on his shoulders, a high collar, black leather gloves, a silver chain of office across his chest. One gloved hand raised a little in a showman's gesture.",
    ref: "public/stage/portraits/auctioneer.webp",
    head: 0.13,
  },
  "auction-assistant": {
    out: "fixtures/march-of-davos/auction-assistant",
    who: "The auctioneer's assistant, Human female",
    look: "A slender young woman, about 1.68 m tall, with black hair pulled into a tight bun and a plain black velvet mask over her eyes. A fitted black high-necked dress with a long black apron, white gloves. She holds a folded dark-red velvet cloth over one arm, ready to unveil a lot.",
    head: 0.13,
  },
  "silverhand-seated": {
    out: "fixtures/march-of-davos/silverhand-seated",
    who: "Silverhand, Kazimir Raskov, Human male smuggler lord, seated",
    look: "A tall, slender man in his forties with a hard handsome face, a thin-lipped smirk and cold amber eyes in the shadow of a deep hood, dark stubble. A dark richly embroidered coat of umber leather with silver-grey scrollwork, hood up, a dark shirt, dark breeches and boots. ONE silver gauntlet only: his LEFT hand (at the right of the picture) wears an intricate gauntlet of polished silver plates and rests on the arm of the chair. His RIGHT hand is bare, with no gauntlet and no armour, resting on his knee. Legs crossed at the knee, at ease and watchful.",
    ref: "public/stage/portraits/silverhand.webp",
    head: 0.17,
    seated: true,
    chair: "a high-backed chair upholstered in deep crimson velvet with a dark carved wooden frame, which is drawn",
    backNote:
      "Seen squarely from directly behind: the chair's tall velvet back hides most of his back; above it his hood covers the whole back of his head. The silver gauntlet shows only at the side on the chair's arm.",
  },
  silverhand: {
    out: "fixtures/march-of-davos/silverhand",
    who: "Silverhand, Kazimir Raskov, Human male smuggler lord",
    look: "A tall, slender man in his forties, about 1.88 m tall, with a hard handsome face, a thin-lipped smirk and cold amber eyes in the shadow of a deep hood, dark stubble. A long dark richly embroidered coat of umber leather with silver-grey scrollwork, hood up, a dark shirt, dark breeches and tall boots. ONE silver gauntlet only: his LEFT hand (at the right of the picture) wears an intricate gauntlet of polished silver plates up to the forearm. His RIGHT hand is bare, with no gauntlet and no armour. A slim sword at his hip. Predatory stillness.",
    ref: "public/stage/portraits/silverhand.webp",
    head: 0.13,
    backNote: "His hood is up and covers the whole back of his head. The long coat hangs down his back to the calves.",
  },
  "silverhand-representative": {
    out: "fixtures/march-of-davos/silverhand-representative",
    who: "Silverhand's representative, Human male",
    look: "A tall, impeccably dressed man in his thirties, about 1.86 m tall, with short dark hair combed back, a narrow cold face, clean-shaven, a calm unreadable expression. A sharp tailored black frock coat buttoned high with a black silk cravat, black gloves, black trousers and polished boots. One gloved hand raised calmly to bid.",
    head: 0.13,
  },
  "raskov-guard": {
    out: "fixtures/march-of-davos/raskov-guard",
    who: "A silent Raskov guard, Human male",
    look: "A broad, hard-faced man, about 1.85 m tall, with a shaved head, a short black beard and a scar through one eyebrow, a black cloth mask over the lower face pulled down at his neck. A dark grey quilted coat over a black leather jerkin, a broad belt with a heavy cudgel and a long knife, dark trousers and boots. Arms folded.",
    head: 0.13,
  },
  "bidder-noblewoman": {
    out: "fixtures/march-of-davos/bidder-noblewoman",
    who: "A masked noblewoman at the auction, Human female",
    look: "An elegant woman in her forties with auburn hair piled high with pearl pins, a gilded filigree mask over her eyes, a pale powdered face and dark red lips. A deep emerald silk gown with gold embroidery and a fur stole, long gloves, a closed fan in one hand.",
    head: 0.17,
    seated: true,
    chair: "a high-backed chair upholstered in deep crimson velvet with a dark carved wooden frame, which is drawn",
  },
  "bidder-merchant": {
    out: "fixtures/march-of-davos/bidder-merchant",
    who: "A masked merchant at the auction, Human male",
    look: "A stout, wealthy merchant in his fifties with a bald head and a heavy grey beard, a plain black velvet mask over his eyes. A plum velvet doublet straining at the buttons, a heavy gold chain, rings on every finger. Both hands resting on a silver-topped cane between his knees.",
    head: 0.17,
    seated: true,
    chair: "a high-backed chair upholstered in deep crimson velvet with a dark carved wooden frame, which is drawn",
  },
  "bidder-collector": {
    out: "fixtures/march-of-davos/bidder-collector",
    who: "A masked collector at the auction, Human male",
    look: "A thin old man in his seventies with long white hair and a long-nosed white porcelain mask over the upper face, bony hands. A rich black robe trimmed with silver fox fur, a tall black hat. Leaning forward eagerly with a small brass opera glass raised in one hand.",
    head: 0.17,
    seated: true,
    chair: "a high-backed chair upholstered in deep crimson velvet with a dark carved wooden frame, which is drawn",
  },
  "bidder-veiled": {
    out: "fixtures/march-of-davos/bidder-veiled",
    who: "A veiled lady at the auction, Human female",
    look: "A slim young woman whose face is hidden by a black lace veil falling from a small black hat, only her chin and dark lips showing. A black velvet gown with a high lace collar, black gloves, a jet necklace. Hands folded on a small beaded purse in her lap.",
    head: 0.17,
    seated: true,
    chair: "a high-backed chair upholstered in deep crimson velvet with a dark carved wooden frame, which is drawn",
  },
  "bidder-young-noble": {
    out: "fixtures/march-of-davos/bidder-young-noble",
    who: "A masked young noble at the auction, Human male",
    look: "A haughty young nobleman in his twenties with wavy blond hair, a gold-and-crimson half-mask with a feather at one side, a smug smile. A slashed crimson-and-gold doublet, a short black cape over one shoulder, a jewelled rapier hilt at his side. Lounging, one arm draped over the chair's back.",
    head: 0.17,
    seated: true,
    chair: "a high-backed chair upholstered in deep crimson velvet with a dark carved wooden frame, which is drawn",
  },
  "bidder-blue": {
    out: "fixtures/march-of-davos/bidder-blue",
    who: "A masked lady at the auction, Human female",
    look: "A poised woman in her thirties with black hair in sleek coils, a midnight-blue lace mask over her eyes, pearl earrings. A dark sapphire velvet gown with a high collar and silver embroidery, a dark shawl over her shoulders, gloved hands holding a small numbered bidding paddle in her lap.",
    head: 0.17,
    seated: true,
    chair: "a high-backed chair upholstered in deep crimson velvet with a dark carved wooden frame, which is drawn",
  },
  "bidder-hooded": {
    out: "fixtures/march-of-davos/bidder-hooded",
    who: "A hooded masked buyer at the auction, Human male",
    look: "A lean man in a deep charcoal hooded cloak with the hood up, the face below it hidden by a plain black leather full mask with narrow eye slits, gloved hands steepled before him. Dark boots.",
    head: 0.17,
    seated: true,
    chair: "a high-backed chair upholstered in deep crimson velvet with a dark carved wooden frame, which is drawn",
  },
  "bidder-beak": {
    out: "fixtures/march-of-davos/bidder-beak",
    who: "A masked dealer at the auction, Human male",
    look: "A heavyset man in his forties with a long-beaked dark leather mask covering his face to the mouth, a short dark beard below it, a wide-brimmed black hat. A dark brown coat with brass buttons, a satchel on his lap with one hand on it.",
    head: 0.17,
    seated: true,
    chair: "a high-backed chair upholstered in deep crimson velvet with a dark carved wooden frame, which is drawn",
  },
  "bidder-silver": {
    out: "fixtures/march-of-davos/bidder-silver",
    who: "A masked elf at the auction, Elf female",
    look: "A slender elf woman with pointed ears and long silver-white hair, a silver leaf-shaped mask over her eyes, pale skin. A dove-grey silk robe with a dark green mantle, slim hands folded, a thin silver circlet.",
    head: 0.17,
    seated: true,
    chair: "a high-backed chair upholstered in deep crimson velvet with a dark carved wooden frame, which is drawn",
  },
  // March of Davos, the street kit: Silverhand's bodyguard and scout on his trail and at his hideout, the Cowl's archer
  // on the roofs, and Joran and Seraphina for the new dawn.
  aldith: {
    out: "fixtures/march-of-davos/aldith",
    who: "Varchk, Half-Orc male bodyguard",
    look: "A huge, heavily muscled half-orc, about 1.98 m tall, with tall proportions and long legs, not a dwarf. Olive-green skin, a heavy brow, a broken nose with a ring through it, a lower tusk jutting from his jaw, a long scar from his forehead down to his cheek, small hard eyes, long black hair in a braid bound with silver rings, a thick black beard. A dark leather brigandine studded with iron over a charcoal tunic, a short dark cloak, heavy bracers, a broad belt, dark trousers and boots. A heavy curved sword sheathed at his hip, his hands empty and loose at his sides. Stoic and watchful.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726459305887",
    head: 0.12,
  },
  kaelen: {
    out: "fixtures/march-of-davos/kaelen",
    who: "Kaeleth, Human female scout and mage",
    look: "A lean young woman in her twenties, about 1.70 m tall, with pale skin, sharp features, piercing pale-blue eyes and long dark hair escaping a deep charcoal hood. A charcoal hooded cloak, wet at the hem, over close-fitting dark grey leathers with a laced bodice, a belt of pouches and a slim wand, dark gloves, tall soft boots. One hand holds the cloak closed at her chest, the other hangs free. Calm and observant.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726461750367",
    head: 0.13,
    backNote:
      "Her deep hood is up and covers the whole back of her head; only a few dark strands of hair show at its edge. The cloak hangs straight down her back to the calves and hides her back completely. Her arms are at her front, out of sight: NO hands, gloves, belt or pouches show from behind, only the outside of the cloak and her boots below it.",
  },
  "cowl-archer": {
    out: "fixtures/march-of-davos/cowl-archer",
    who: "Liora, Half-Elf female assassin of the Covenant of the Cowl",
    look: "A slender, graceful half-elf woman, about 1.72 m tall, her face in the shadow of a deep black hood: narrow gleaming grey eyes, high cheekbones, a black cloth mask over her nose and mouth, the tip of one pointed ear at the hood's edge. A long black hooded cloak of rough wool over close-fitting black leathers with dark straps, a quiver of black-fletched arrows on her back, black gloves, soft black boots. A dark longbow held in her left hand, an arrow nocked but the string undrawn, pointed down. Silent and still.",
    head: 0.13,
    backNote: "Her deep hood is up and covers the whole back of her head. The black cloak hangs down her back; the quiver's black fletchings rise over her right shoulder.",
  },
  joran: {
    out: "fixtures/march-of-davos/joran",
    who: "Joran Antonov, Human male Valkaran scholar turned revolutionary",
    look: "A lean young man of about thirty, about 1.82 m tall, with a gaunt, intense, determined face, dark deep-set eyes, short unkempt dark hair and a short dark beard. Long dark Covenant robes of charcoal wool with the hood thrown back, a deep grey mantle with a worn border of old Valkaran knotwork, a rope belt, dark boots. His right hand is raised high holding an ancient key of dark bronze as long as a forearm, its bow set with a pale blue stone, glowing faintly. His left hand open at his side.",
    head: 0.13,
  },
  seraphina: {
    out: "fixtures/march-of-davos/seraphina",
    who: "Seraphina Valtor, Human female clan matriarch",
    look: "A tall, upright noblewoman in her late sixties, about 1.70 m tall, with voluminous white hair swept up and back, a lined, proud face, keen dark eyes and a knowing half-smile, gold drop earrings set with amethyst. A heavy gown of ivory brocade worked with gold thread, a high embroidered collar, a dark green velvet mantle on her shoulders fastened with an old Valkaran gold brooch, rings on her fingers. Her hands folded before her.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726609419379",
    head: 0.13,
    backNote:
      "Seen squarely from directly behind, her whole body facing AWAY from us: the back of her white hair, the green velvet mantle hanging from her shoulders down her back to the hem, and the gown's brocade skirt below it. Her hands, face, jewels and the front of the gown are NOT visible.",
  },
  // March of Davos, the cellar kit: the Blackthorn sommelier and the servant who follows him down to the wine cellar.
  "clive-stonebrook": {
    out: "fixtures/march-of-davos/clive-stonebrook",
    who: "Clive Stonebrook, Human male sommelier of House Blackthorn",
    look: "A tall, wiry man in his fifties, about 1.86 m tall, with tall human proportions and long legs. Greying hair slicked straight back, a long sharp nose tilted up, thin pursed lips, a disdainful expression. Crisp formal household livery: a black tailcoat with silver piping over a dove-grey waistcoat, a white shirt with a high collar and black stock, a silver brooch of a thorned rose on his lapel, black breeches, white stockings and buckled black shoes. A silver tasting cup on a chain round his neck. One hand raised a little as he speaks, the other holding a dusty wine bottle.",
    head: 0.13,
  },
  "mira-hearthstone": {
    out: "fixtures/march-of-davos/mira-hearthstone",
    who: "Mira Hearthstone, Human female household servant",
    look: "A short, sturdy young woman of about twenty, about 1.58 m tall, with a round flushed face, a sheen of sweat on her brow, anxious brown eyes and brown hair tucked under a white linen cap. Practical Blackthorn household dress: a dark grey wool gown with the sleeves pushed up, a long white apron, a black bodice laced at the front. A small notepad in one hand and a pencil in the other.",
    head: 0.13,
    backNote: "An apron shows only its ties from behind; the gown's skirt hangs down her back. The notepad and pencil show only at her sides.",
  },
  // March of Davos, the tunnel kit: the Covenant's saboteurs in the catacombs, and the undead of Old Valkara.
  "covenant-rogue": {
    out: "fixtures/march-of-davos/covenant-rogue",
    who: "A Covenant of the Cowl rogue, Human male agent",
    look: "A lean, quick man of about thirty, about 1.78 m tall, his face half hidden under a deep charcoal hood and a dark cloth mask over his nose and mouth, sharp watchful eyes. Close-fitting dark leathers with many straps, a short charcoal cloak, dark gloves, soft boots. A short blade in his right hand and a small hand crossbow in his left, both held low. Crouched a little, ready to move.",
    head: 0.13,
    backNote:
      "His deep hood is up and covers the whole back of his head. The short cloak hangs to his waist; below it his leathers, belt and boots show. His blade and crossbow show only at his sides.",
  },
  "covenant-cultist": {
    out: "fixtures/march-of-davos/covenant-cultist",
    who: "A Covenant of the Cowl cultist, Human female zealot",
    look: "A gaunt woman of about forty, about 1.68 m tall, in a rough, patched robe of undyed brown wool with a deep hood pulled up, her thin pale face fervent, hollow-cheeked, smudged with soot. A rope belt hung with a pouch of alchemical powder and a coil of waxed fuse cord, a flint striker in one hand, the other hand cupped round a small lit taper. Bare dirty feet in sandals.",
    head: 0.13,
    backNote: "Her deep hood is up and covers the whole back of her head. The rough robe hangs to her ankles; the rope belt is tied at the back.",
  },
  "ancient-undead": {
    out: "fixtures/march-of-davos/ancient-undead",
    who: "An ancient undead warrior of Old Valkara",
    look: "A tall skeletal warrior, about 1.85 m tall, grey-brown bones with scraps of dried sinew, a fanged skull with faint cold blue light glowing in its hollow eye sockets. Rusted ancient armour: a corroded bronze-and-iron scale shirt hanging in tatters, a dented conical helm with a broken nasal, a rotten fur mantle on one shoulder, rags of a dark tabard with a faded knotwork border. A notched, rusted longsword in its right hand, a split round shield on its left arm. Dust and grave dirt falling from it.",
    head: 0.13,
  },
  // March of Davos, the Blackthorn mansion: the house and its guards, the masked guests of the ball, the Covenant's
  // assassin, and Bishop Nicolai masked for the ball and bare-faced at the talks after.
  "door-guard": {
    out: "fixtures/march-of-davos/door-guard",
    who: "The Blackthorn door guard, Human male",
    look: "A big, broad-shouldered guard captain in his forties, about 1.92 m tall, with tall human proportions and long legs, not a dwarf. A square weathered face, a short copper-red beard, cropped red-brown hair, hard grey eyes. Black lacquered plate armour over mail, a high collar, pauldrons edged in dull gold, a black tabard with the Blackthorn crest of a black thorned tree on gold. Gauntleted hands, one resting on the pommel of a sheathed longsword, the other holding a guest list.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726597363187",
    head: 0.12,
  },
  "blackthorn-guard": {
    out: "fixtures/march-of-davos/blackthorn-guard",
    who: "A Blackthorn house guard, Human male",
    look: "A tall, hard-faced house guard of about thirty, about 1.85 m tall, with short dark hair and a clean-shaven jaw. Polished black lacquered armour over dark leather, iron-plated shoulders and bracers, a black tabard stitched with the Blackthorn crest of a black thorned tree on gold. A longsword sheathed at his hip, a halberd held upright in his right hand. Standing at attention.",
    head: 0.12,
  },
  "thaddeus-blackthorn": {
    out: "fixtures/march-of-davos/thaddeus-blackthorn",
    who: "Lord Thaddeus Blackthorn, Human male noble, at his masquerade ball",
    look: "A tall, broad-shouldered nobleman in his late thirties, about 1.88 m tall, with slicked-back dark hair, sharp angular features, a strong jaw and piercing blue eyes behind an ornate gilded half-mask that covers his brow and cheekbones. Immaculate formal dress: a high-collared doublet of midnight blue silk worked with gold thread, a heavy cloak of dark blue lined with gold silk thrown back from one shoulder, a gold medallion with a black thorned tree on his chest, black breeches and polished boots. One hand raised in a gesture to the crowd.",
    head: 0.13,
  },
  "astrid-ball": {
    out: "fixtures/march-of-davos/astrid-ball",
    who: "Lady Astrid Blackthorn, Human female noble, at the masquerade ball",
    look: "A tall young noblewoman in her mid-twenties, about 1.78 m tall, with a sharp, striking face, intense forest-green eyes behind an ornate gold filigree half-mask, dark red lips, and long black hair swept up with a few loose strands. A black velvet gown with a high choker collar and a cameo, black feathered trim at the shoulders, and a voluminous wrap of rich golden-yellow brocade silk draped round her arms. Proud and watchful.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726361535587",
    head: 0.13,
  },
  "seraphina-masked": {
    out: "fixtures/march-of-davos/seraphina-masked",
    who: "Seraphina Valtor, Human female clan matriarch, at the masquerade ball",
    look: "A tall, upright noblewoman in her late sixties, about 1.70 m tall, with voluminous white hair swept up and back, a lined, proud face and a knowing half-smile, keen dark eyes behind an ornate bronze-gold filigree half-mask set with a small amethyst, gold drop earrings. A heavy gown of ivory brocade worked with gold thread, a high embroidered collar, a dark green velvet mantle on her shoulders, rings on her fingers. Her hands folded before her.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726609419379",
    head: 0.13,
    backNote:
      "Seen squarely from directly behind, her whole body facing AWAY from us: the back of her white hair with the mask's ribbon tied in it, the green velvet mantle hanging from her shoulders down her back, and the gown's brocade skirt below it. Her hands, face and the front of the gown are NOT visible.",
  },
  "bishop-nicolai-masked": {
    out: "fixtures/march-of-davos/bishop-nicolai-masked",
    who: "Bishop Nicolai Petrov of the Church of Valkara, Human male, at the masquerade ball",
    look: "A tall, spare churchman in his fifties, about 1.82 m tall, wearing a smooth full-face mask of polished silver with dark eye slits under a tall headdress of gold brocade set with small jewels. A long black velvet cassock-coat with a high collar trimmed in gold embroidery, a black mantle, a silver chain with the round symbol of Thyra on his chest, one hand fingering the chain. Grey hair showing at the nape.",
    ref: "https://s3.us-east-1.amazonaws.com/d20-public/images/d20/1726609448307",
    head: 0.13,
  },
  "bishop-nicolai": {
    out: "fixtures/march-of-davos/bishop-nicolai",
    who: "Bishop Nicolai Petrov of the Church of Valkara, Human male",
    look: "A tall, spare churchman in his fifties, about 1.82 m tall, with a narrow, lined face, a neat grey beard, close-cut grey hair, heavy-lidded measuring eyes. A long black cassock with a high collar, a white stole embroidered in gold with Valkaran knotwork, a silver chain with the round symbol of Thyra on his chest, a plain black skullcap. Hands clasped before him.",
    head: 0.13,
  },
  aelindor: {
    out: "fixtures/march-of-davos/aelindor",
    who: "Aelindor, Elf male bard",
    look: "A tall, ethereal elf of indeterminate age, about 1.85 m tall, with long shimmering silver hair to his waist, pointed ears, a fine pale face and grey eyes. Long flowing robes of deep green and silver, layered and embroidered with leaves, a silver circlet, and a half-mask of silver leaves pushed up on his brow for the ball. He plays an ornately carved lyre of dark heartwood held against his chest, fingers on the strings.",
    head: 0.13,
  },
  "covenant-assassin": {
    out: "fixtures/march-of-davos/covenant-assassin",
    who: "The Covenant of the Cowl assassin, Human male",
    look: "A lean, wiry man of about thirty, about 1.80 m tall, his face hidden in the shadow of a deep black hood and a black cloth mask over his nose and mouth, only cold pale eyes showing. A long black hooded cloak of fine wool split for running, close-fitting black leathers with many straps, a coil of black rope with a grappling hook at his hip, black gloves, soft black boots. A curved poisoned dagger in his right hand, its blade faintly green.",
    head: 0.13,
    backNote: "His deep hood is up and covers the whole back of his head. The black cloak hangs down his back to the calves; the coil of rope shows at his hip.",
  },
  "guest-crimson": {
    out: "fixtures/march-of-davos/guest-crimson",
    who: "A masked guest in crimson, Human female noble, at the Blackthorn masquerade ball",
    look: "A slim noblewoman of about thirty, about 1.68 m tall, with auburn hair pinned up with pearls, a full-face porcelain mask painted with gold leaf. A floor-length gown of crimson velvet with a deep red hooded cloak trimmed in gold thread, long gloves, a closed fan in one hand.",
    head: 0.13,
  },
  "guest-ivory": {
    out: "fixtures/march-of-davos/guest-ivory",
    who: "A masked guest in ivory, Human female noble, at the Blackthorn masquerade ball",
    look: "A tall young noblewoman of about twenty-five, about 1.72 m tall, with long pale blonde hair under a sheer ivory veil, a silver lace mask over her eyes. A gown of ivory silk embroidered in gold and crimson, a long trailing sleeve, a string of pearls.",
    head: 0.13,
  },
  "guest-raven": {
    out: "fixtures/march-of-davos/guest-raven",
    who: "A masked guest in black, Human male noble, at the Blackthorn masquerade ball",
    look: "A tall nobleman of about forty, about 1.85 m tall, in a long black velvet coat with a high collar, a black beaked raven half-mask, a black tricorne hat, silver buttons and a silver-topped cane. A dark beard.",
    head: 0.13,
  },
  "guest-gold": {
    out: "fixtures/march-of-davos/guest-gold",
    who: "A masked guest in gold, Human male noble, at the Blackthorn masquerade ball",
    look: "A stout, wealthy nobleman of about fifty, about 1.76 m tall, a gilded sun mask with rays round his face, a doublet of gold brocade, a short crimson cape, a heavy gold chain, a goblet of wine in one hand.",
    head: 0.13,
  },
  // The Road to Kordavos: Dmitri's caravan on the Marquis Road, the two travellers met with it, and Borina at her table.
  // Volkov's house mark is a black wolf's head on saffron, on his guards' tabards and his wagons' canvas.
  "dmitri-mounted": {
    out: "fixtures/the-road-to-kordavos/dmitri-mounted",
    who: "Dmitri Volkov, Human male merchant, riding his horse at the head of his caravan",
    look: "A sturdy man of about sixty with neatly combed white hair and a full, neatly combed white beard, a confident, shrewd, smiling face with keen eyes. Fine, practical travelling clothes, clean and well kept: a broad-brimmed brown leather hat, a deep-red riding coat with a cream fur collar over a dark doublet, brown leather gloves, tall riding boots in the stirrups. He sits upright in the saddle of a sturdy chestnut horse with a white blaze down its face and a pale cream mane and tail. Good worn leather bridle, saddle and saddlebags, a rolled blanket behind the saddle.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/the-road-to-kordavos/npcs/225e726d-4795-4d1c-8d8d-0f7b8f42e094.png",
    head: 0.1,
    pose: "horse and rider together. The horse stands still on all four hooves, its body turned a three-quarter angle toward the camera, its head toward the camera and a little to one side. The rider sits upright in the saddle, facing the camera, one hand on the reins, the other resting on his thigh. The WHOLE horse and rider are small enough in the frame to leave a wide margin, at least 8% of empty background on every side: no hoof, ear, hat or tail touches the edge. Eye-level view.",
    backNote:
      "Horse and rider are seen squarely from directly behind: the horse's rump and cream tail nearest the camera, its hind legs, and the rider's back above it, his red coat and fur collar and the back of his hat. The horse's head points AWAY from the camera, so only the tips of its ears show past the rider: NO horse face, NO rider face.",
  },
  "pack-horse": {
    out: "fixtures/the-road-to-kordavos/pack-horse",
    who: "A pack horse of a merchant caravan",
    look: "A sturdy, patient dark-bay pack horse with a black mane and tail, laden with a wooden pack saddle carrying bundles of cloth in oilskin, small casks and canvas bales tied with rope on both sides. A plain leather halter with a lead rope hanging down. No rider.",
    head: 0.3,
    pose: "the whole horse standing still on all four hooves, its body turned a three-quarter angle toward the camera, its head toward the camera and a little to one side, the load on its back. The WHOLE horse is small enough in the frame to leave a wide margin, at least 8% of empty background on every side: no hoof, ear or tail touches the edge. Eye-level view.",
    backNote:
      "The horse is seen squarely from directly behind: its rump and black tail nearest the camera, its hind legs, the load on both sides of the pack saddle. Its head points AWAY from the camera, so only the tips of its ears show: NO face.",
  },
  "draft-horse": {
    out: "fixtures/the-road-to-kordavos/draft-horse",
    who: "A draft horse in harness, pulling a merchant's wagon",
    look: "A big, heavy grey draft horse with a pale mane and feathered hooves, in a dark leather harness with a padded collar round its neck, brass fittings, blinkers on the bridle and long traces running back from its sides. No rider and no wagon.",
    head: 0.3,
    pose: "the whole horse standing still on all four hooves, its body turned a three-quarter angle toward the camera, its head toward the camera and a little to one side. The WHOLE horse is small enough in the frame to leave a wide margin, at least 8% of empty background on every side: no hoof, ear or tail touches the edge. Eye-level view.",
    backNote:
      "The horse is seen squarely from directly behind: its rump and pale tail nearest the camera, its hind legs, the harness straps over its back and the traces at its sides. Its head points AWAY from the camera, so only the tips of its ears and the top of the collar show: NO face.",
  },
  "caravan-guard-a": {
    out: "fixtures/the-road-to-kordavos/caravan-guard-a",
    who: "A caravan guard, Human male, of the Volkov trading house",
    look: "A weathered, watchful man of about forty, tall human proportions, long legs, not a dwarf, about 1.82 m tall, a short dark beard and a steel kettle helm. A padded brown gambeson under a saffron tabard bearing a black wolf's head, a sword at his hip, a round wooden shield on his left arm and a spear held upright in his right hand. Leather bracers, dark trousers and boots.",
    head: 0.13,
  },
  "caravan-guard-b": {
    out: "fixtures/the-road-to-kordavos/caravan-guard-b",
    who: "A caravan guard, Human female, of the Volkov trading house",
    look: "A lean, alert woman of about thirty, about 1.72 m tall, sun-browned, black hair cropped short. A short brown leather jerkin over a saffron tunic bearing a black wolf's head, a quiver of bolts at her hip, a loaded crossbow held low in both hands. A grey travelling cloak thrown back, dark trousers and boots.",
    head: 0.13,
  },
  teamster: {
    out: "fixtures/the-road-to-kordavos/teamster",
    who: "A teamster, Human male wagon driver of a merchant caravan",
    look: "A broad, ruddy man of about fifty, about 1.76 m tall, a grey stubbled jaw and a battered felt hat. A faded saffron work shirt with rolled sleeves, a brown leather apron-vest, a coiled driving whip in one hand, sturdy dusty boots.",
    head: 0.13,
  },
  elaraen: {
    out: "fixtures/the-road-to-kordavos/elaraen",
    who: "Elaraen Whisperwind, Half-Elf male bard",
    look: "A lean half-elf man of about thirty with expressive green eyes, slightly pointed ears, tousled dark hair, and a charming, easy smile with a hint of melancholy. Practical, well-kept travelling clothes: a moss-green vest over a loose cream shirt, a long colourful scarf of red, teal and gold patterns wound round his neck, a small intricate silver brooch, brown trousers and worn boots. A lute held in his hands across his chest, a travelling pack on his back.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/the-road-to-kordavos/npcs/09000b84-bff7-4c85-bba3-05e48f32f8ca.png",
    head: 0.13,
  },
  "sister-mira": {
    out: "fixtures/the-road-to-kordavos/sister-mira",
    who: "Sister Mira, Human female cleric of Valkara",
    look: "A sturdy woman in her late twenties with sun-kissed, freckled skin, kind, observant grey-green eyes a little weary from the road, and long curly brown hair worn back in practical braids. Well-kept brown leather armour with a short fur collar over simple undyed wool robes, a silver holy symbol of Valkara on a chain at her chest, a plain wooden walking staff in one hand, a travelling pack on her back.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/the-road-to-kordavos/npcs/24fbafb0-8cc1-4e2e-97d4-8fb67b9d60a7.png",
    head: 0.13,
  },
  borina: {
    out: "fixtures/the-road-to-kordavos/borina",
    who: "Borina Runetongue, Dwarf female fortune teller, seated",
    look: "A stout, very broad old dwarf woman with stout dwarf proportions, not a short human, a weathered, deeply lined face and piercing blue eyes, with a gentle, knowing look. Long dark hair streaked with grey, bound by an embroidered headband and worn in many braids threaded with silver beads and small polished stones. Layers of dark navy and charcoal embroidered robes with red and gold borders, rustling with hidden trinkets and pouches, many silver necklaces and amulets, rings and wide silver bracelets. Her hands rest on her knees.",
    ref: "https://d20-public.s3.us-east-1.amazonaws.com/images/settings/realm-of-myr/the-road-to-kordavos/npcs/7a98e364-48a3-4d85-8155-5505fe6c29ca.png",
    head: 0.2,
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

const seatedOn = (f: Figure) => (f.chair ? SEATED.replace("a plain round three-legged wooden tavern stool about 45 cm high", f.chair).replace("the stool's feet", "the chair's feet") : SEATED)

const frontPrompt = (f: Figure) =>
  `${
    f.ref
      ? "Three reference images are provided. Image 1 is the character's existing portrait: use it for face, hair, colouring, costume and mood, painted as an original character rather than a photographic likeness. Image 2 is a finished standee from this game: match its finish and detail only, it is a different character. Image 3 is a screenshot of the painted game world: it is the art direction."
      : "Two reference images are provided. Image 1 is a finished standee from this game: match its finish and detail only, it is a different character. Image 2 is a screenshot of the painted game world: it is the art direction."
  }

Character: ${f.who}
Appearance: ${f.look}

${onKey(f, ART.replace("- POSE", f.pose ? `- Pose: ${f.pose}` : f.seated ? seatedOn(f) : STANDING))}`

const BACK = `Two reference images are provided. Image 1 is the finished FRONT view of a character. Image 2 is a screenshot of a painted game world: it is the ART DIRECTION to match.

Render the SAME character seen from directly behind: same outfit, colours, gear, hair and proportions; back of head, no face visible; same standing pose from behind; same painted finish, light and palette; full body head to toe with margins; solid green background; no outline, no ground shadow. It is the exact figure of image 1 as if the camera walked 180 degrees around it while it stood frozen.

Requirements:
- Match image 1 in silhouette, height, build, stance and footprint. Whatever is held stays in the same hand (the figure's own left and right are unchanged, so from behind they swap sides on screen). A cloak, pack, quiver, hood or hair continues plausibly from the front design, as carefully finished as the front.
- The head is seen from behind. No face, no profile, no glance over the shoulder.
- Same painterly manner as image 1: oil-painting brushwork, muted earthy palette. Soft neutral daylight from the upper left. NOT photorealistic, NOT cartoon, NOT a 3D render.
- NO outline of any kind and NO cast shadow on the ground.
- Full body, head to toe, standing, eye-level view, nothing cropped, about 6% margin on all sides, feet flat near the bottom of the frame.
- Background: SOLID UNIFORM PURE GREEN (#00FF00) everywhere, edge to edge. No scenery, no text, no border, no logo. One character only.`

// Swaps the green screen for magenta in a prompt.
const onKey = (f: Figure, text: string) =>
  f.magenta
    ? text
        .replaceAll("PURE GREEN (#00FF00)", "PURE MAGENTA (#FF00FF)")
        .replaceAll("solid green background", "solid magenta background")
        .replace("One character only.", "One character only. Nothing pink, purple or magenta in the subject itself.")
    : text
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
  const ref = f.ref ? [await jpeg(f.ref.startsWith("http") ? Buffer.from(await (await fetch(f.ref)).arrayBuffer()) : f.ref, "#8a8a8a")] : []
  await keep("front", id, await render(id, frontPrompt(f), [...ref, await jpeg(FINISH, "#8a8a8a"), await jpeg(STYLE, "#000")]))
}
async function back(id: string) {
  const { path } = await latest("front", id)
  if (!existsSync(path)) throw new Error(`No front for ${id}. Run front first.`)
  const note = FIGURES[id].backNote
  const chair = FIGURES[id].chair ? "chair" : "stool"
  const seated = FIGURES[id].seated
    ? `${BACK.replaceAll("standing pose", "seated pose").replace("Full body, head to toe, standing", `Full body, head to toe, sitting on the same ${chair}`)}\n- The figure sits on the same ${FIGURES[id].chair ? "chair, its back toward us, hiding most of the figure's back" : "three-legged stool"}, seen from behind.`
    : BACK
  const f = FIGURES[id]
  const posed = f.pose
    ? seated
        .replaceAll("same standing pose from behind", "same pose from behind")
        .replace("Full body, head to toe, standing, eye-level view", "Full body, the whole creature, eye-level view")
        .replace("feet flat near the bottom of the frame", "its feet near the bottom of the frame")
    : seated
  // A chair's back hides a seated figure: only the head above it and the elbows beside it show.
  const chairBack = f.chair
    ? "We see the BACK of the chair, square on: its tall upholstered back, the rear of the velvet in its carved wooden frame, fills the middle of the picture and hides the figure behind it. Above the chair's top only the BACK of the head and hair (and any hat or hood) show; beside it only the outer edges of the sleeves at the elbows; below the seat only the chair's back legs and the heels of the shoes. NO face, NO chest, NO lap, NO knees, NO hands, NO front of the clothes anywhere."
    : ""
  const notes = [note, chairBack].filter(Boolean).join("\n- ")
  const text = onKey(f, notes ? `${posed}\n- ${notes}` : posed)
  await keep("back", id, await render(`${id} back`, text, [await jpeg(path, f.magenta ? "#ff00ff" : "#00ff00"), await jpeg(STYLE, "#000")]))
}

// Distance-from-green key (olive cloaks survive), eroded two pixels and despilled at the edge, cropped to the figure.
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
async function cutout(path: string, magenta = false) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  // How far each pixel leans toward the screen: green over red and blue, or red and blue over green.
  const lean = (i: number) => (magenta ? Math.min(data[i], data[i + 2]) - data[i + 1] : data[i + 1] - Math.max(data[i], data[i + 2]))
  for (let i = 0; i < data.length; i += 4) data[i + 3] = Math.round(255 * (1 - smooth(45, 125, lean(i))))
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
    if (alpha[p] < 250 && !magenta) data[i + 1] = Math.min(data[i + 1], Math.max(data[i], data[i + 2]))
    if (alpha[p] < 250 && magenta) {
      const cap = Math.round(data[i + 1] * 1.05 + 10)
      data[i] = Math.min(data[i], cap)
      data[i + 2] = Math.min(data[i + 2], cap)
    }
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
  const turn = async (img: sharp.Sharp) => (f.hue ? sharp(await img.modulate({ hue: f.hue, saturation: 0.85 }).png().toBuffer()) : img)
  const fr = await turn(await cutout((await latest("front", id)).path, f.magenta))
  await fr.clone().resize({ height: 2048, fit: "inside", withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100, effort: 5 }).toFile(`${out}-front.webp`)
  const bk = await turn(await cutout((await latest("back", id)).path, f.magenta))
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
