// Whether a figure's weights are whole, read off the skinned mesh at rest, with no clip played. armcheck.ts and
// legcheck.ts watch the skin move. This finds what breaks it before anything moves.
//
//   pnpm assets:weights thalbern-hi3d     one figure
//   pnpm assets:weights                   every figure with a model on disk
//   pnpm assets:weights --where           and how high on the body each figure's leaking points are
//
// For each figure:
//   unweighted  points no bone moves: they stay put while the body walks off
//   dropped     points that lose a fifth of their pull or more in the game. three.js reads four bones a point
//               (JOINTS_0) and scales those up to a whole, so a fifth bone's share (JOINTS_1) goes to the others
//   arm leak    points out past a shoulder joint pulled by the other arm: a hand that drags the far side of the chest
//   leg leak    points out past a hip joint pulled by the other leg. Reported, not a fault: a robe, a coat or a cloak
//               hangs across both legs, and its skin is shared so it does not tear between them. In trousers it is one
//   empty       limb and trunk bones that move no point at all
//
// Adapted from weight_report in scenario-labs/skills (skills/dcc/blender/scenario-blender-rigging, MIT): its
// unweighted, influences and empty-bone counts. Its sum check is left out, since three.js makes every point's four
// weights whole as it loads. Its mirror check is left out, since a generated mesh is not
// symmetric point for point. The leak is its one-sided pose test, read from the weights instead of a pose.

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { type Mat, mul, skinPoint } from "./pose";

// A pull counts as a leak from this weight, on a point out past the joint its bone's family hangs from on the other
// side: the hip for a leg, the shoulder for an arm. Inside that, a robe or the crotch is shared by both legs as it
// should be. A point drops pull when its fifth bone and on held this much.
const LIMITS = { pull: 0.05, dropped: 0.2 };
// The joint each family of bones hangs from, and the bones of the family. A bone outside these never leaks.
const FAMILIES = [
	{ name: "legs", from: "UpLeg", bones: ["UpLeg", "Leg", "Foot", "ToeBase"] },
	{ name: "arms", from: "Arm", bones: ["Shoulder", "Arm", "ForeArm", "Hand"] },
];
const MAJOR = [
	"Hips",
	"Spine",
	"Spine1",
	"Spine2",
	"Neck",
	"Head",
	...["Left", "Right"].flatMap((s) =>
		["Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot"].map((b) => `${s}${b}`),
	),
];

type Leak = { count: number; most: number; bones: string[]; bands: number[] };
type Result = {
	id: string;
	points: number;
	unweighted: number;
	dropped: number;
	most: number;
	leak: Record<string, Leak> | null;
	empty: string[];
};

async function check(id: string): Promise<Result | null> {
	const dir = `asset-library/characters/${id}`;
	if (!existsSync(`${dir}/figure.json`)) return null;
	const file = (
		JSON.parse(await readFile(`${dir}/figure.json`, "utf8")) as {
			lods?: { file: string }[];
		}
	).lods?.[0]?.file;
	if (!file || !existsSync(`${dir}/${file}`)) return null;
	const doc = await new NodeIO()
		.registerExtensions(ALL_EXTENSIONS)
		.read(`${dir}/${file}`);
	const skin = doc.getRoot().listSkins()[0];
	const prim = doc
		.getRoot()
		.listMeshes()
		.flatMap((m) => m.listPrimitives())
		.find((p) => p.getAttribute("JOINTS_0"));
	const [pos, J, W, J1, W1, bind] = [
		prim?.getAttribute("POSITION"),
		prim?.getAttribute("JOINTS_0"),
		prim?.getAttribute("WEIGHTS_0"),
		prim?.getAttribute("JOINTS_1"),
		prim?.getAttribute("WEIGHTS_1"),
		skin?.getInverseBindMatrices(),
	];
	if (!skin || !pos || !J || !W || !bind)
		throw new Error(`No skinned mesh in ${dir}/${file}`);
	const joints = skin.listJoints();
	const names = joints.map((j) => j.getName().replace(/^.*:/, ""));
	const skinned: Mat[] = joints.map((j, i) =>
		mul(j.getWorldMatrix(), bind.getElement(i, new Array(16).fill(0))),
	);
	const at = (name: string) => {
		const i = names.indexOf(name);
		return i < 0 ? null : joints[i].getWorldMatrix().slice(12, 15);
	};

	const count = pos.getCount();
	const rest: number[][] = [];
	const pulls: [number[], number[]][] = [];
	const total = new Array(joints.length).fill(0);
	let [unweighted, dropped, most] = [0, 0, 0];
	for (let i = 0; i < count; i++) {
		const [j, w] = [
			J.getElement(i, [0, 0, 0, 0]),
			W.getElement(i, [0, 0, 0, 0]),
		];
		const [j1, w1] = [
			J1?.getElement(i, [0, 0, 0, 0]) ?? [0, 0, 0, 0],
			W1?.getElement(i, [0, 0, 0, 0]) ?? [0, 0, 0, 0],
		];
		const [first, rest1] = [
			w.reduce((a, b) => a + b, 0),
			w1.reduce((a, b) => a + b, 0),
		];
		if (first + rest1 < 1e-4) unweighted++;
		const share = rest1 / Math.max(1e-9, first + rest1);
		if (share >= LIMITS.dropped) dropped++;
		most = Math.max(most, share);
		for (let k = 0; k < 4; k++) {
			total[j[k]] += w[k];
			total[j1[k]] += w1[k];
		}
		pulls.push([j, w]);
		rest.push(skinPoint(pos.getElement(i, [0, 0, 0]), j, w, skinned));
	}

	// Which way is the figure's left: the side its Left bones stand on, from the hips.
	let leak: Result["leak"] = null;
	const hips = at("Hips");
	const family = (name: string) => {
		const side = name.startsWith("Left")
			? 0
			: name.startsWith("Right")
				? 1
				: -1;
		const f = FAMILIES.findIndex((fam) =>
			fam.bones.some((b) => name.slice(side ? 5 : 4).startsWith(b)),
		);
		return side < 0 || f < 0 ? null : { side, f };
	};
	const of = names.map(family);
	const reach = FAMILIES.map((fam) => [
		at(`Left${fam.from}`),
		at(`Right${fam.from}`),
	]);
	if (hips && reach.some(([l, r]) => l && r)) {
		const sign =
			Math.sign(
				reach.reduce((a, [l, r]) => a + (l && r ? l[0] - r[0] : 0), 0),
			) || 1;
		const ys = rest.map((p) => p[1]);
		const [low, H] = [Math.min(...ys), Math.max(...ys) - Math.min(...ys) || 1];
		const found = FAMILIES.map((): Leak & { set: Set<string> } => ({
			count: 0,
			most: 0,
			bones: [],
			bands: new Array(10).fill(0),
			set: new Set(),
		}));
		for (let i = 0; i < count; i++) {
			const x = (rest[i][0] - hips[0]) * sign;
			const [j, w] = pulls[i];
			const pull = FAMILIES.map(() => 0);
			for (let k = 0; k < 4; k++) {
				const fam = of[j[k]];
				if (w[k] < 1e-4 || !fam) continue;
				// The joint on the other side from the bone's own: a point out past it is on the far side of the body.
				const far = reach[fam.f][1 - fam.side];
				if (!far) continue;
				const out = (far[0] - hips[0]) * sign;
				if (out > 0 ? x <= out : x >= out) continue;
				pull[fam.f] += w[k];
				if (w[k] > LIMITS.pull) found[fam.f].set.add(names[j[k]]);
			}
			pull.forEach((p, f) => {
				if (p > LIMITS.pull) {
					found[f].count++;
					found[f].bands[
						Math.min(9, Math.floor(((rest[i][1] - low) / H) * 10))
					]++;
				}
				found[f].most = Math.max(found[f].most, p);
			});
		}
		leak = Object.fromEntries(
			FAMILIES.map((fam, f) => [
				fam.name,
				{
					count: found[f].count,
					most: found[f].most,
					bones: [...found[f].set].sort(),
					bands: found[f].bands,
				},
			]),
		);
	}
	const empty = MAJOR.filter(
		(m) => names.includes(m) && total[names.indexOf(m)] < 1e-3,
	);
	return { id, points: count, unweighted, dropped, most, leak, empty };
}

async function main() {
	const [only] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
	const where = process.argv.includes("--where");
	const ids = only
		? [only]
		: (await readdir("asset-library/characters", { withFileTypes: true }))
				.filter((d) => d.isDirectory())
				.map((d) => d.name);
	const bad: string[] = [];
	console.log(
		"figure".padEnd(22),
		"points ",
		"unweighted",
		"dropped (points, most)",
		"arm leak  ",
		"leg leak    ",
		"empty",
	);
	for (const id of ids.sort()) {
		const r = await check(id);
		if (!r) {
			if (only)
				throw new Error(`No model on disk for ${id}: pnpm assets:fetch ${id}`);
			continue;
		}
		const leak = (name: string) =>
			r.leak
				? `${r.leak[name].count}, ${r.leak[name].most.toFixed(2)}`
				: "no sides";
		console.log(
			r.id.padEnd(22),
			String(r.points).padEnd(7),
			String(r.unweighted).padEnd(10),
			`${r.dropped}, ${r.most.toFixed(2)}`.padEnd(22),
			leak("arms").padEnd(10),
			leak("legs").padEnd(12),
			r.empty.join(", "),
		);
		if (r.unweighted) bad.push(`${r.id}: ${r.unweighted} points no bone moves`);
		if (r.dropped)
			bad.push(
				`${r.id}: ${r.dropped} points lose a fifth of their pull or more past four bones, at most ${Math.round(r.most * 100)}%`,
			);
		const arms = r.leak?.arms;
		if (arms?.count)
			bad.push(
				`${r.id}: ${arms.count} points pulled by the other arm's ${arms.bones.join(", ")}`,
			);
		for (const [name, l] of Object.entries(r.leak ?? {}))
			if (where && l.count)
				console.log(
					`    ${name}: leaking points by height, feet to head in tenths: ${l.bands.join(" ")}`,
				);
		if (r.empty.length) bad.push(`${r.id}: ${r.empty.join(", ")} move nothing`);
	}
	console.log(
		bad.length
			? `\n${bad.length} over a limit:\n${bad.map((b) => `  ${b}`).join("\n")}`
			: "\nNothing over a limit.",
	);
	if (bad.length) process.exitCode = 1;
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
