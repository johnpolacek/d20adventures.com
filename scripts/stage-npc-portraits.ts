// Paints portraits for NPCs whose sheets have only the stock avatar, in the style of the painted NPC portraits, and
// publishes them where story view and the turn order look for them (public/stage/portraits, see
// scripts/stage-encounter-art.ts, which lists them in apps/desktop/src/npc-portraits.ts).
//
//   node --env-file=.env.local --import tsx scripts/stage-npc-portraits.ts paint [id,id...]     # new raw portraits
//   node --env-file=.env.local --import tsx scripts/stage-npc-portraits.ts publish [id,id...]   # crop the latest raw
//
// Without ids, every NPC sheet with the stock avatar. Raw paintings go to PORTRAIT_RAW (default: the OS temp dir).
// Review each before publishing. The API key is read from GOOGLE_GENERATIVE_AI_API_KEY and is never printed.

import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"

const MODEL = "gemini-3-pro-image"
const RAW = process.env.PORTRAIT_RAW ?? join(tmpdir(), "d20-portraits")
const NPCS = "content/settings/realm-of-myr/npcs"
const OUT = "public/stage/portraits"
// Painted NPC portraits whose finish the new ones match. Both men: a woman's reference lent its face to every woman
// painted from it.
const STYLE = ["bram", "garlan-ironfist"]

// A figure to paint the portrait from, when the cutout came first and the portrait must match it.
const FIGURE: Record<string, string> = {
  "covenant-cultist": "public/stage/fixtures/march-of-davos/covenant-cultist-front.webp",
  "covenant-rogue": "public/stage/fixtures/march-of-davos/covenant-rogue-front.webp",
}

// What the sheets leave out, from the encounters they appear in.
const NOTES: Record<string, string> = {
  "astrid-blackthorn":
    "Lady Astrid Blackthorn, early thirties, heir of the richest noble house in Kordavos and a hunter at heart. A long, weathered face with high cheekbones, grey-green eyes, a thin pale scar through her left eyebrow, wind-burned skin. A noblewoman's bearing in a ranger's fitted dark leather armour with fine tooled details and a dark green cloak clasped with a silver brooch of a black tree twisted into a circle.",
  "thaddeus-blackthorn":
    "Lord Thaddeus Blackthorn, late forties, head of House Blackthorn, rich and proud, a confident, charming smile that does not reach his eyes. A black velvet doublet in the Asterian court fashion, with silver embroidery and the black tree crest.",
  "joran-antonov":
    "Joran Antonov, late twenties, a scholar's lean face hardened by grief and purpose, dark hair, a short beard, burning eyes. Dark hooded robes of the Covenant of the Cowl over a scholar's clothes, the hood pushed back, an old iron key on a cord at his throat.",
  silverhand: "Silverhand, a crime lord of the Lower Districts, forties. The hood leaves the upper face in shadow, a thin-lipped smirk, the silver gauntlet raised near his face.",
  "covenant-assassin": "One assassin of the Covenant of the Cowl, the hood deep, a cloth mask over the lower face, only the eyes showing.",
  "covenant-cultist":
    "One zealot of the Covenant of the Cowl, a gaunt woman of about forty, a thin pale hollow-cheeked face, fervent eyes, soot smudged on her cheeks. A rough patched robe of undyed brown wool with a deep hood pulled up, a rope belt with a pouch of powder and a coil of waxed fuse cord. She cups a small lit taper near her chest. Dim catacomb stone softly behind.",
  "covenant-rogue":
    "One agent of the Covenant of the Cowl, a lean quick young man of about twenty-two, clean-shaven, close-cropped dark hair, a sharp youthful face with dark watchful eyes, his face fully visible: the charcoal hood is down on his shoulders and he wears no mask. A bold oxblood-red wool scarf wound at his neck. Close-fitting charcoal-grey leathers with dark straps, a short charcoal cloak, a small hand crossbow in his left hand near his shoulder. Dim catacomb stone softly behind.",
  "warehouse-thug": "One dockside mercenary posing as a warehouse worker, a broken nose, stubble, a sleeveless work tunic.",
  "blackthorn-guard": "One house guard, a stern man in his thirties, an open-faced helmet.",
  auctioneer:
    "A smooth black leather Venetian half-mask over the eyes and nose, with plain almond eyeholes, no ears, horns or points, tied behind the head. Greying hair swept back, a thin, practised smile.",
  "ancient-undead": "The head and shoulders of one risen Valkaran warrior: a skull in a corroded bronze helm with faint pale-blue light in the empty eye sockets.",
  "forest-drake": "The head and neck of a forest drake, a wingless-looking wyrm head with horns like old roots, moss in the seams of its scales.",
  aelindor: "An elf of the Valkarr Forest, ageless, calm and courteous.",
  "mira-hearthstone": "Her notepad is a small leather-bound book of rough paper and a pencil of graphite in wood, nothing modern, no spiral binding.",
  "silverhand-representative":
    "Facing the viewer. A tall man in his thirties, short dark hair combed back, a narrow cold clean-shaven face, a calm unreadable stare. Late-medieval clothes in the Asterian court fashion: a fitted black silk doublet with a standing collar, slashed sleeves showing dark crimson silk beneath, a narrow gold trim at collar and cuffs, a short black half-cape over one shoulder, black leather gloves. Nothing modern, no suit, no buttoned jacket, no cravat. A plain dark candlelit auction hall softly behind, no books, no lettering.",
  "door-guard":
    "A silent Blackthorn house guard at the masked ball, forties, a square weathered face, close-cropped black hair, a short black beard, hard grey eyes. Black lacquered plate over mail, pauldrons edged in dull gold, a black tabard with the Blackthorn crest of a black tree twisted into a circle. A gilded ballroom softly behind.",
  "bishop-nicolai":
    "Bishop Nicolai Petrov of the old native church, fifties, tall and spare, a narrow lined face, heavy-lidded measuring eyes, stern and composed, unmasked. A full long grey beard. A tall black cylindrical brimless hat with a black veil falling behind to the shoulders. Dark layered vestments: a black outer robe over a deep green under-robe, a broad stole of dark green and gold brocade worked with oak-leaf knotwork. On his chest a large silver pectoral medallion of a tree entwined with a crescent moon, hung on a heavy chain. No cross, no white collar, no skullcap. Behind him, softly, candlelight on a gilded screen carved with oak leaves. No lettering, no figures from any real faith.",
  "merrick-the-musician":
    "A half-elf festival bard, lithe, long flowing brown hair, pointed ears, an easy smile. A patchwork doublet of red, blue and ochre wool with folk embroidery at the cuffs over a loose linen shirt. He holds a pear-shaped wooden lute with a bent-back pegbox and a carved rose sound hole, never a guitar. Harvest festival lanterns behind.",
  "seraphina-valtor":
    "Seraphina Valtor, matriarch of a traditionalist native clan, late sixties, voluminous white hair swept up and back, a lined proud face, keen dark eyes, a knowing half-smile, gold drop earrings set with amethyst, unmasked. An ivory brocade gown with a high collar embroidered in red and green native folk patterns, a dark green velvet mantle fastened with an old gold brooch of an oak and a stag.",
  beric:
    "A native dockworker in his forties, short dark tousled hair, heavy dark stubble, a weathered sun-darkened face with a deep old scar running diagonally across it, hard hazel eyes. A coarse undyed wool shirt with red embroidered collar and cuffs under a worn dark-brown leather coat, a wide belt with an iron cargo hook. Docks in low sun behind.",
  "loric-windrider":
    "A native dock foreman in his late fifties, a deeply sun-worn face, close-cropped grey hair, a short grey beard, squinting wary eyes. A heavy scuffed leather apron over a rough linen shirt with faded red folk embroidery at the collar, rolled sleeves, thick forearms. Ship rigging softly behind.",
  "karim-the-jewel-merchant":
    "A jewel merchant from a far southern port, forties, a neatly trimmed black beard, a warm sly smile. A dark silk kaftan with a high collar, heavy gold embroidery and small set gemstones in the Asterian court fashion, a gold chain, rings. A festival stall with a striped awning and lanterns softly behind, warm dusk light.",
  "liora-the-spice-merchant":
    "Clearly a woman: a short, stout native market woman in her forties with a soft round feminine face, full lips, ruddy cheeks and a warm grin, curly brown hair in two thick braids, gold hoop earrings, and a short braided brown beard on her chin bound with a brass ring. A saffron-yellow wool shawl over a linen blouse with red folk embroidery, a woven headband. Spice stalls softly behind.",
  "finn-swiftfoot":
    "A young halfling street thief with a cheeky, youthful face, small pointed ears, very messy shaggy dark-brown hair, rosy grubby cheeks, a gap-toothed mischievous grin, wide eyes. A too-big patched cream linen shirt under a frayed dark-brown wool waistcoat. Painted like the references with real skin and proportions, never a cartoon. A dim lane behind.",
  "mara-redleaf":
    "A halfling girl urchin of about fourteen, small pointed ears only a little larger than a human's, long tangled copper-red hair with a few thin braids, a freckled dirt-smudged face, a sly knowing smile. A faded ochre wool blouse with simple red embroidery at the neck, a ragged grey hooded cloak thrown back, a small brass pendant. A dim lane behind.",
  "grendel-one-eye":
    "A grizzled trinket dealer in his fifties, wild greying dark hair, a short grey-streaked beard, a scar through his left brow and that left eye cloudy white and blind, the other eye wild, a wide crooked grin. A black coat over a red-and-gold brocade tunic, brass amulets and chains at his neck. Market lanterns softly behind.",
  "scarface-alaric":
    "A smuggler in his thirties, jet-black hair tied back in a ponytail, piercing blue eyes, a deep jagged scar down his cheek and older scars on brow and jaw, a cold sneer. A worn grey-brown wool tunic over dark leather, a dark woven sash. A dim dockside warehouse behind.",
  kaelen:
    "A scout and mage in her twenties, pale skin, sharp features, pale-blue eyes with no glow, long dark hair escaping a deep charcoal wool hood beaded with rain. Close-fitting dark grey leathers, the cloak held closed at her chest. A wet lantern-lit lane softly behind, warm lantern light on her face.",
  "madam-zephyra":
    "An elf fortune teller, tall and slender, piercing green eyes, long dark wavy hair, pointed ears. A violet wool headscarf edged with small gold coins, layered robes of deep red and violet embroidered with stars and eyes, strings of amber beads. A candlelit festival tent behind.",
  "vesk-the-fence":
    "A fence of stolen goods in his forties, thin and sallow, slicked-back black hair, a pencil moustache, small beady eyes, a nervous ingratiating smile. A shiny dark-green velvet coat gone shabby at the cuffs over a stained cream linen shirt with faded embroidery at the collar, a gold earring, too many rings, his twitching fingers steepled before his chest. A cluttered stall in a shadowy market corner behind, candlelight.",
  "sister-danica":
    "A serene native priestess in her thirties, long dark-brown hair in an intricate braid over one shoulder, calm dark eyes, a gentle knowing smile. Long flowing robes of deep blue-grey wool over a cream inner robe, a stole embroidered in silver with folk patterns, wide sleeves, a corded belt. A silver pendant of a tree intertwined with a crescent moon. Shelves of old books and scrolls softly behind.",
  "clive-stonebrook":
    "The sommelier of a rich noble house, fifties, tall and wiry, greying hair slicked straight back, a long sharp nose tilted up, thin pursed lips, a disdainful look. Late-medieval household livery in the Asterian court fashion: a black wool doublet with silver piping and a standing collar, a dove-grey silk undershirt showing at the throat, a silver thorned-rose brooch, a silver tasting cup on a chain round his neck. Nothing modern, no suit lapels. Wine casks and candlelight softly behind.",
  "larya-halloway":
    "Facing the viewer, looking straight out. A tall, strong woman in her thirties who leads a traditionalist native clan, long dark-brown hair worn half up, a diagonal red scar across her left cheek, a dark teardrop earring, a hard proud glare. A finely tailored sleeveless tunic of ochre-gold wool, its collar embroidered in red and green folk patterns, a cream linen shirt beneath, a tooled leather shoulder strap, a fine silver chain at her throat. A festival square softly behind.",
  silas:
    "A rooftop archer of the Covenant, forties, a lean narrow hard face fully visible, grey stubble, watchful grey eyes, a thin old scar on his chin. A charcoal hood pushed half back off short grey-streaked hair, no mask. A worn dark-brown leather jerkin over a grey wool shirt, a shortbow over his shoulder and arrow fletchings behind it. Night rooftops and chimneys softly behind, a cool moon with warm window light.",
  liora:
    "A half-elf assassin in her late twenties, high cheekbones, narrow gleaming pale grey eyes, a long pointed ear showing through straight ash-blonde hair that falls from a black hood. A black cloth mask pulled down around her neck, her face uncovered. A black wool cloak over close-fitting dark green-black leathers, the curve of a dark longbow over her shoulder. Night rooftops softly behind.",
  garrick:
    "A huge half-orc doorkeeper, forties, grey-green skin, a heavy jaw with short lower tusks, a flat broken nose, narrow hard eyes, a scowling mouth, his face clearly lit under a ragged grey-green wool hood. A tattered charcoal cloak over worn dark leather armour with iron buckles, arms crossed. Painted like the references, not a 3D render. A torch-lit doorway softly behind.",
  aldith:
    "A huge half-orc bodyguard, olive-green skin, a heavy brow, a broken nose with an iron ring, a lower tusk jutting up clearly from his jaw, a long scar from his forehead down to his cheek, small hard eyes, long black hair in a braid bound with silver rings, a thick black beard. A dark leather brigandine studded with iron over a charcoal wool tunic, a short dark cloak. Muted natural colours, warm side light like the references. A dim tavern softly behind.",
}

const STOCK = (image?: string) => !image || image.includes("/avatar/")

type Sheet = { id: string; name: string; race?: string; gender?: string; archetype?: string; appearance?: string; image?: string }
const sheet = async (id: string) => JSON.parse(await readFile(join(NPCS, `${id}.json`), "utf8")) as Sheet

function prompt(s: Sheet) {
  const creature = /monster/i.test(s.archetype ?? "")
  const who = creature ? `${s.name}, a creature` : [s.gender && s.gender !== "Unknown" ? s.gender : "", s.race, s.archetype ? `(${s.archetype.toLowerCase()})` : ""].filter(Boolean).join(" ")
  return `Paint a portrait of ${s.name}, ${who}, for a fantasy role-playing game set in a frontier city of a medieval realm.
The look is late-medieval, grounded, low fantasy. Native folk wear wool, linen and fur with embroidered collars and cuffs. The ruling imperial colonists wear silk, brocade and gold trim.

${s.appearance ?? ""}
${NOTES[s.id] ?? ""}

${FIGURE[s.id] ? `The first image is ${s.name}'s own figure, full length: paint the same person, matching gender, build, face, hair and outfit. The other images ` : "The reference portraits "}show the painting style only. Do not copy their faces, hair, jewellery or clothes: give ${s.name} a face of their own, as described.
Match the reference portraits exactly in finish: a richly detailed digital oil painting, realistic proportions, a carefully painted, expressive face with clear eyes and natural skin, dramatic warm side light with deep shadows, muted earthy colours.
- Composition: square, ${creature ? "the creature's head filling most of the frame" : "head and shoulders, the face in the upper half of the frame, looking toward the viewer"}.
- Background: dark and softly out of focus, a hint of a setting that suits the character, never busy.
- One figure only. No text, no border, no frame, no logo.`
}

async function render(label: string, text: string, images: string[]) {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set")
  const body = JSON.stringify({
    contents: [{ parts: [{ text }, ...images.map((data) => ({ inline_data: { mime_type: "image/jpeg", data } }))] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1", imageSize: "1K" } },
  })
  const call = () =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body })
  let res = await call()
  for (let tries = 0; (res.status === 429 || res.status === 500 || res.status === 503) && tries < 5; tries++) {
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

async function latest(id: string) {
  const files = (await readdir(RAW)).filter((f) => f.startsWith(`${id}-`) && /^\d+\.png$/.test(f.slice(id.length + 1)))
  const n = Math.max(0, ...files.map((f) => Number(f.slice(id.length + 1, -4))))
  return { n, path: join(RAW, `${id}-${n}.png`) }
}

async function main() {
  const [step, list] = process.argv.slice(2)
  await mkdir(RAW, { recursive: true })
  const all = (await readdir(NPCS)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))
  const ids = list ? list.split(",") : (await Promise.all(all.map(async (id) => ((await sheet(id)).image && !STOCK((await sheet(id)).image) ? null : id)))).filter((id): id is string => Boolean(id))
  if (step === "paint") {
    const style = await Promise.all(
      STYLE.map(async (id) => {
        const res = await fetch((await sheet(id)).image!)
        return (
          await sharp(Buffer.from(await res.arrayBuffer()))
            .jpeg({ quality: 88 })
            .toBuffer()
        ).toString("base64")
      })
    )
    // Three at a time keeps clear of the image model's rate limit.
    for (let i = 0; i < ids.length; i += 3)
      await Promise.all(
        ids.slice(i, i + 3).map(async (id) => {
          const figure = FIGURE[id] ? [(await sharp(FIGURE[id]).flatten({ background: "#8a8a8a" }).jpeg({ quality: 88 }).toBuffer()).toString("base64")] : []
          const png = await render(id, prompt(await sheet(id)), [...figure, ...style])
          const { n } = await latest(id)
          const path = join(RAW, `${id}-${n + 1}.png`)
          await writeFile(path, png)
          await appendFile(join(RAW, "generations.log"), `${new Date().toISOString()} ${id} #${n + 1} ${MODEL}\n`)
          console.log(`painted  ${path}`)
        })
      )
  } else if (step === "publish") {
    await mkdir(OUT, { recursive: true })
    for (const id of ids) {
      const { n, path } = await latest(id)
      if (!n) {
        console.log(`no raw   ${id}`)
        continue
      }
      await sharp(path)
        .resize({ width: 360, height: 432, fit: "cover", position: "north" })
        .webp({ quality: 80 })
        .toFile(join(OUT, `${id}.webp`))
      console.log(`published ${id} from #${n}`)
    }
    console.log("Run scripts/stage-encounter-art.ts to list them for the app.")
  } else throw new Error("step: paint or publish")
}
void main()
