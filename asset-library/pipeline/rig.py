# Rigs a generated character in headless Blender: one skeleton for every character, weights that follow the body, and
# lighter copies for far cameras.
#
#   D=asset-library/characters/garlan
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P asset-library/pipeline/rig.py -- $D/source.glb $D/joints.json $D .
#
# In:  an unrigged GLB standing in an A-pose, and the character's height with its joints on the front painting the
#      model was made from, in that painting's pixels (figures/<id>.json, the file figure.ts reads).
# Out: <name>-lod0.glb, -lod1.glb and -lod2.glb, each a skinned mesh with no clips, and <name>.json, what was made.
#
# The skeleton is the one figure.ts writes: the same bone names and parents, and every bone square to the world at rest
# (x the figure's left, y up, z the way it faces), so one set of clips, written as turns, plays on every character.
#
# Weights are solved on a stand-in: the mesh remade as one closed skin, which a generated mesh's loose shells and holes
# are not. Blender's heat solve runs on that, and the real mesh takes its weights from the nearest point of it.

import json
import os
import struct
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree

BONES = ["root", "hips", "spine", "chest", "neck", "head", "upperarmL", "forearmL", "handL", "upperarmR", "forearmR", "handR", "thighL", "shinL", "footL", "thighR", "shinR", "footR"]
PARENT = {
    "hips": "root", "spine": "hips", "chest": "spine", "neck": "chest", "head": "neck",
    "upperarmL": "chest", "forearmL": "upperarmL", "handL": "forearmL",
    "upperarmR": "chest", "forearmR": "upperarmR", "handR": "forearmR",
    "thighL": "hips", "shinL": "thighL", "footL": "shinL",
    "thighR": "hips", "shinR": "thighR", "footR": "shinR",
}  # fmt: skip
# Where each bone ends while weights are solved: the joint it reaches toward.
TAIL = {
    "hips": "spine", "spine": "chest", "chest": "neck", "neck": "head", "head": "headTop",
    "upperarmL": "forearmL", "forearmL": "handL", "handL": "handTipL",
    "upperarmR": "forearmR", "forearmR": "handR", "handR": "handTipR",
    "thighL": "shinL", "shinL": "footL", "footL": "toeL",
    "thighR": "shinR", "shinR": "footR", "footR": "toeR",
}  # fmt: skip
# Triangles and texture width for each copy, and the width of its colour. The first keeps the mesh as it came, and
# its colour as it came too, 4096 across: a face is a hundred pixels of a 2048 texture, and the camera goes up to it.
LODS = [(None, 2048, 4096), (20000, 1024, 1024), (6000, 512, 512)]

src, spec_file, out_dir, name = sys.argv[sys.argv.index("--") + 1 :][:4]
# A name of "." is a character's own folder: the copies are lod0.glb and on, and the report rig.json.
prefix = "" if name == "." else f"{name}-"
if name == ".":
    name = os.path.basename(os.path.abspath(out_dir))
spec = json.load(open(spec_file))
H = float(spec["height"])


def active(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def coords(mesh):
    a = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    mesh.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)


# ── The mesh, standing on the ground at its height, facing -y as Blender has a glTF figure ──
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.context.scene.objects):
    if o != body:
        bpy.data.objects.remove(o, do_unlink=True)
body.name = name

# A glTF mesh comes apart along every edge of its texture layout: a third of a generated figure's points are such
# doubles. Thinned as it is, each side of a seam is thinned on its own and the seams open into tears, across a face as
# anywhere. Welded first, the mesh is one skin again and keeps its texture layout on its corners.
weld = bmesh.new()
weld.from_mesh(body.data)
before = len(weld.verts)
bmesh.ops.remove_doubles(weld, verts=weld.verts, dist=1e-5)
welded = before - len(weld.verts)
weld.to_mesh(body.data)
weld.free()
body.data.update()

# A generator faces its figure whichever way it likes. Arms held out make the figure widest from side to side, and
# its boots reach forward of its shins: turned so that side to side is x and forward is -y.
co = coords(body.data)
quarter = 0
if np.ptp(co[:, 0]) < np.ptp(co[:, 1]):
    quarter = 1
    co = np.stack([-co[:, 1], co[:, 0], co[:, 2]], axis=1)
tall = np.ptp(co[:, 2])
low = co[:, 2].min()
boots = co[co[:, 2] < low + 0.04 * tall]
shins = co[(co[:, 2] > low + 0.15 * tall) & (co[:, 2] < low + 0.3 * tall)]
if boots[:, 1].mean() > shins[:, 1].mean():
    quarter += 2
# A robe to the ankles has no shins to read, and the figure can come out facing backward: its knees then bend the
# wrong way. "turn" in the joints file is quarter turns added to the guess. 2 turns it about.
quarter += int(spec.get("turn", 0))
body.data.transform(Matrix.Rotation(quarter * np.pi / 2, 4, "Z"))
body.data.update()

co = coords(body.data)
z0, z1 = float(co[:, 2].min()), float(co[:, 2].max())
k = H / (z1 - z0)
crown = co[co[:, 2] > z0 + 0.92 * (z1 - z0)]
waist = co[(co[:, 2] > z0 + 0.45 * (z1 - z0)) & (co[:, 2] < z0 + 0.6 * (z1 - z0)) & (np.abs(co[:, 0] - crown[:, 0].mean()) < 0.1 * (z1 - z0))]
shift = np.array([crown[:, 0].mean(), (waist[:, 1].min() + waist[:, 1].max()) / 2, z0], dtype=np.float32)
co = (co - shift) * k
body.data.vertices.foreach_set("co", co.reshape(-1))
body.data.update()

# ── What the sheet painted in flat blue is cut out ──
# A hand that holds something is painted closed round a short blue rod (build.ts), so the generator models fingers and
# a thumb round something. Blue is nothing else on a figure. Every face the texture colours blue is taken out, which
# leaves the hand with a way through it, and the rod's own line and width are kept for the prop that goes there.
brief_path = os.path.join(out_dir, "character.json")
brief = json.load(open(brief_path)) if os.path.exists(brief_path) else {}
tunnel = None
if (brief.get("holds") or {}).get("rod"):
    painted_by = None
    for m in body.data.materials:
        for shader in [n for n in (m.node_tree.nodes if m and m.use_nodes else []) if n.type == "BSDF_PRINCIPLED"]:
            trail = [link.from_node for link in shader.inputs["Base Color"].links]
            while trail and painted_by is None:
                node = trail.pop()
                if node.type == "TEX_IMAGE" and node.image:
                    painted_by = node.image
                trail += [link.from_node for socket in node.inputs for link in socket.links]
    if painted_by is not None:
        tw, th = painted_by.size
        T = np.empty(tw * th * 4, dtype=np.float32)
        painted_by.pixels.foreach_get(T)
        T = T.reshape(th, tw, 4)
        top_channel = np.maximum(T[..., 0], T[..., 1])
        blue = (T[..., 2] > 0.4) & (T[..., 2] > 1.7 * top_channel)
        cut = bmesh.new()
        cut.from_mesh(body.data)
        uv = cut.loops.layers.uv.active

        def is_blue(u, v):
            return bool(blue[min(th - 1, max(0, int((v % 1.0) * th))), min(tw - 1, max(0, int((u % 1.0) * tw)))])

        gone = []
        for f in cut.faces:
            at_uv = [loop[uv].uv for loop in f.loops]
            cu, cv = sum(q.x for q in at_uv) / len(at_uv), sum(q.y for q in at_uv) / len(at_uv)
            if is_blue(cu, cv) + sum(is_blue(cu + (q.x - cu) * 0.6, cv + (q.y - cv) * 0.6) for q in at_uv) >= 2:
                gone.append(f)
        if len(gone) >= 20:
            pts = np.array([v.co[:] for f in gone for v in f.verts], dtype=np.float64)
            middle = pts.mean(axis=0)
            runs = np.linalg.eigh(np.cov((pts - middle).T))[1][:, -1]
            if runs[2] < 0:
                runs = -runs
            along_rod = (pts - middle) @ runs
            from_line = np.linalg.norm((pts - middle) - np.outer(along_rod, runs), axis=1)
            bmesh.ops.delete(cut, geom=gone, context="FACES")
            bmesh.ops.delete(cut, geom=[v for v in cut.verts if not v.link_faces], context="VERTS")
            cut.to_mesh(body.data)
            tunnel = {"middle": middle, "runs": runs, "wide": float(np.percentile(from_line, 75)), "faces": len(gone), "long": float(np.ptp(along_rod))}
        cut.free()
        body.data.update()
        if tunnel:
            # What blue is left is a fringe on the fingers beside the rod: it takes the colour of the skin about it.
            fringe = (T[..., 2] > 0.3) & (T[..., 2] > 1.25 * top_channel)
            spread = fringe.copy()
            for _ in range(6):
                grown = spread.copy()
                grown[1:, :] |= spread[:-1, :]
                grown[:-1, :] |= spread[1:, :]
                grown[:, 1:] |= spread[:, :-1]
                grown[:, :-1] |= spread[:, 1:]
                spread = grown
            about = spread & ~fringe
            if about.any():
                T[fringe, :3] = np.median(T[about][:, :3], axis=0)
            # And the rod's blue was in the light on the hand that held it: the skin about it came out lilac. Skin is
            # never bluer than it is green, so on what lies close about the rod's line the blue is brought under.
            close_by = bmesh.new()
            close_by.from_mesh(body.data)
            uv = close_by.loops.layers.uv.active
            for f in close_by.faces:
                c = np.array(f.calc_center_median()[:]) - tunnel["middle"]
                along_c = float(c @ tunnel["runs"])
                if abs(along_c) > 0.17 or np.linalg.norm(c - along_c * tunnel["runs"]) > 0.15:
                    continue
                us = [loop[uv].uv.x % 1.0 for loop in f.loops]
                vs = [loop[uv].uv.y % 1.0 for loop in f.loops]
                x0, x1 = max(0, int(min(us) * tw) - 1), min(tw, int(max(us) * tw) + 2)
                y0, y1 = max(0, int(min(vs) * th) - 1), min(th, int(max(vs) * th) + 2)
                if x1 - x0 > 400 or y1 - y0 > 400:
                    continue
                patch = T[y0:y1, x0:x1, :3]
                cast = patch[..., 2] > 0.9 * patch[..., 1]
                patch[..., 2] = np.where(cast, np.minimum(patch[..., 2], patch[..., 1] * 0.84), patch[..., 2])
            close_by.free()
            painted_by.pixels.foreach_set(T.reshape(-1))
            painted_by.update()
        del T
    co = coords(body.data)
source_triangles = sum(len(p.vertices) - 2 for p in body.data.polygons)

# ── Joints: across and up from the painting, depth from the middle of the mesh there ──
J = spec["joints"]
top = J["headTop"][1]
bottom = max(J["toeL"][1], J["toeR"][1]) + spec.get("sole", 6)
px = H / (bottom - top)
centre = J["hips"][0]


def depth(x, z, r=0.035):
    near = co[(co[:, 0] - x) ** 2 + (co[:, 2] - z) ** 2 < (r * H) ** 2]
    return float((near[:, 1].min() + near[:, 1].max()) / 2) if len(near) else 0.0


at = {}
for joint, (jx, jy) in J.items():
    x, z = (jx - centre) * px, (bottom - jy) * px
    at[joint] = Vector((x, depth(x, z), z))
for side in "LR":
    # The ankle sits in the leg, not half way along the foot, and the toe is the front of the boot.
    ankle, toe = at[f"foot{side}"], at[f"toe{side}"]
    ankle.y = depth(ankle.x, ankle.z + 0.05 * H)
    boot = co[(np.abs(co[:, 0] - ankle.x) < 0.07 * H) & (co[:, 2] < 0.06 * H)]
    at[f"toe{side}"] = Vector((ankle.x, float(boot[:, 1].min()) if len(boot) else ankle.y - 0.1 * H, 0.02 * H))
    # A fingertip on the same line as the forearm, when the painting's own lies outside the mesh.
    at[f"handTip{side}"].y = at[f"hand{side}"].y
    # A knee a touch ahead of the line from hip to ankle: a tabard or a scabbard beside it would pull the middle of the
    # mesh there well off the leg.
    at[f"shin{side}"].y = (at[f"thigh{side}"].y + ankle.y) / 2 - 0.012 * H

# ── The skeleton, with bones that reach to the next joint while weights are solved ──
arm = bpy.data.armatures.new(f"{name}-skeleton")
rig = bpy.data.objects.new(f"{name}-skeleton", arm)
bpy.context.scene.collection.objects.link(rig)
active(rig)
bpy.ops.object.mode_set(mode="EDIT")
for b in BONES:
    eb = arm.edit_bones.new(b)
    if b == "root":
        eb.head, eb.tail = Vector((0, 0, 0)), Vector((0, 0, 0.1))
        eb.use_deform = False
    else:
        eb.head, eb.tail = at[b], at[TAIL[b]]
for b, p in PARENT.items():
    arm.edit_bones[b].parent = arm.edit_bones[p]
bpy.ops.object.mode_set(mode="OBJECT")

# ── Weights, solved on a closed stand-in and handed to the mesh ──
proxy = body.copy()
proxy.data = body.data.copy()
proxy.name = "stand-in"
bpy.context.scene.collection.objects.link(proxy)
proxy.data.materials.clear()
active(proxy)
remesh = proxy.modifiers.new("skin", "REMESH")
remesh.mode = "VOXEL"
remesh.voxel_size = 0.011 * H
bpy.ops.object.modifier_apply(modifier=remesh.name)
# A hollow mesh comes back with a second skin lining its inside, which no bone can be seen from. Only the outer one is kept.
bm = bmesh.new()
bm.from_mesh(proxy.data)
seen = set()
shells = []
for v in bm.verts:
    if v in seen:
        continue
    shell, stack = [], [v]
    seen.add(v)
    while stack:
        a = stack.pop()
        shell.append(a)
        for e in a.link_edges:
            b = e.other_vert(a)
            if b not in seen:
                seen.add(b)
                stack.append(b)
    shells.append(shell)
shells.sort(key=lambda sh: max(q.co.z for q in sh) - min(q.co.z for q in sh) + 1e-6 * len(sh), reverse=True)
outer = max(shells[:3], key=lambda sh: max(q.co.x for q in sh) - min(q.co.x for q in sh)) if shells else []
keep = set(outer)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v not in keep], context="VERTS")
bm.to_mesh(proxy.data)
bm.free()
stand_in = {"points": len(proxy.data.vertices), "skins": len(shells)}
bpy.ops.object.select_all(action="DESELECT")
proxy.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")


def weighted(ob):
    return sum(1 for v in ob.data.vertices if any(g.weight > 1e-4 for g in v.groups))


solve = "heat"
stand_in["weighted"] = round(weighted(proxy) / max(1, len(proxy.data.vertices)), 3)
if stand_in["weighted"] < 0.5:
    # The heat solve gave up. Weights by distance from each bone are rougher, and never empty.
    solve = "envelope"
    proxy.vertex_groups.clear()
    bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")


def patch(ob):
    """A point with no weights takes those of the nearest point that has some. Returns how many were patched."""
    loose = [v for v in ob.data.vertices if not any(g.weight > 1e-4 for g in v.groups)]
    if not loose or len(loose) == len(ob.data.vertices):
        return len(loose)
    tree = KDTree(len(ob.data.vertices) - len(loose))
    for v in ob.data.vertices:
        if any(g.weight > 1e-4 for g in v.groups):
            tree.insert(v.co, v.index)
    tree.balance()
    for v in loose:
        near = ob.data.vertices[tree.find(v.co)[1]]
        for g in near.groups:
            ob.vertex_groups[g.group].add([v.index], g.weight, "REPLACE")
    return len(loose)


patch(proxy)

for b in BONES[1:]:
    body.vertex_groups.new(name=b)
active(body)
hand = body.modifiers.new("weights", "DATA_TRANSFER")
hand.object = proxy
hand.use_vert_data = True
hand.data_types_verts = {"VGROUP_WEIGHTS"}
hand.vert_mapping = "POLYINTERP_NEAREST"
hand.layers_vgroup_select_src = "ALL"
hand.layers_vgroup_select_dst = "NAME"
bpy.ops.object.modifier_apply(modifier=hand.name)
bpy.data.objects.remove(proxy, do_unlink=True)

# ── Two things read off the weighted body ──
G = {g.index: g.name for g in body.vertex_groups}
P = coords(body.data)
N = len(P)
W = {b: np.zeros(N, dtype=np.float32) for b in BONES[1:]}
for v in body.data.vertices:
    for g in v.groups:
        W[G[g.group]][v.index] = g.weight
leg = {side: W[f"thigh{side}"] + W[f"shin{side}"] + W[f"foot{side}"] for side in "LR"}
armw = {side: W[f"upperarm{side}"] + W[f"forearm{side}"] + W[f"hand{side}"] for side in "LR"}


def off_line(a, b):
    """How far each point of the body lies from the line between two joints."""
    a, b = np.array(a), np.array(b)
    t = np.clip(((P - a) @ (b - a)) / max(1e-9, float((b - a) @ (b - a))), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * (b - a)), axis=1)


# Slung gear: a bow, a scabbard, a staff. The mesh is one fused skin, so the end of a bow that hangs past the hip took
# the thigh's weights and swung with the leg. A thin thing that hangs from the belt line, well clear of the leg it was
# given to, follows the hips instead. A cloak or a skirt is wide, and is left to the legs.
slung = 0
legs = leg["L"] + leg["R"]
clear = np.minimum.reduce([off_line(at[f"{a}{side}"], at[f"{b}{side}"]) for side in "LR" for a, b in (("thigh", "shin"), ("shin", "foot"), ("foot", "toe"))])
loose_of_leg = (legs > 0.5) & (clear > 0.075 * H)
if loose_of_leg.any():
    part = bmesh.new()
    part.from_mesh(body.data)
    part.verts.ensure_lookup_table()
    done = np.zeros(N, dtype=bool)
    for start in np.flatnonzero(loose_of_leg):
        if done[start]:
            continue
        piece, stack = [], [int(start)]
        done[start] = True
        while stack:
            i = stack.pop()
            piece.append(i)
            for e in part.verts[i].link_edges:
                j = e.other_vert(part.verts[i]).index
                if loose_of_leg[j] and not done[j]:
                    done[j] = True
                    stack.append(j)
        Q = P[piece]
        thin = max(np.ptp(Q[:, 0]), np.ptp(Q[:, 1])) < 0.1 * H
        if len(piece) >= 5 and thin and Q[:, 2].max() > at["hips"].z - 0.15 * H:
            for i in piece:
                moved = sum(W[f"{b}{side}"][i] for side in "LR" for b in ("thigh", "shin", "foot"))
                for side in "LR":
                    for b in ("thigh", "shin", "foot"):
                        body.vertex_groups[f"{b}{side}"].add([i], 0.0, "REPLACE")
                body.vertex_groups["hips"].add([i], float(W["hips"][i] + moved), "REPLACE")
            slung += len(piece)
    part.free()

# How far out a hanging arm must stand to clear this body, each side: the least angle from straight down at which the
# forearm and the hand pass clear of what hangs at the hips beside them. A lean figure's arms hang close, and an
# armoured one's stand out. It is measured on the bulk of each, not its outermost point: a strap end or a hilt that a
# hand brushes is nothing, and an arm held wide for it reads as a doll's. Never wider than 22 degrees.
WIDEST = 22.0
hang = {}
body_points = (armw["L"] + armw["R"]) < 0.2
for side, sg in (("L", 1.0), ("R", -1.0)):
    S, E = at[f"upperarm{side}"], at[f"forearm{side}"]
    rest = float(np.degrees(np.arctan2(abs(E.x - S.x), S.z - E.z)))
    lower = (W[f"forearm{side}"] + W[f"hand{side}"]) > 0.5
    A = P[lower]
    hang[side] = round(min(rest, WIDEST), 1)
    if len(A) < 10:
        continue
    r = np.hypot(A[:, 0] - S.x, A[:, 2] - S.z)
    phi = np.arctan2(sg * (A[:, 0] - S.x), -(A[:, 2] - S.z))
    near = body_points & (np.abs(P[:, 1] - A[:, 1].mean()) < 0.05 * H)
    B = P[near]
    for angle in np.arange(7.0, min(rest, WIDEST) + 0.01, 1.0):
        turned = phi - np.radians(rest - angle)
        # How far out each point of the arm stands on its own side, and how high.
        ax, az = r * np.sin(turned) + sg * S.x, S.z - r * np.cos(turned)
        gap = np.inf
        for z0 in np.arange(az.min(), az.max(), 0.02 * H):
            band = (az >= z0) & (az < z0 + 0.02 * H)
            wall = B[(B[:, 2] >= z0) & (B[:, 2] < z0 + 0.02 * H)]
            if band.sum() >= 4 and len(wall) >= 4:
                gap = min(gap, float(np.percentile(ax[band], 15) - np.percentile(sg * wall[:, 0], 85)))
        if gap >= 0:
            hang[side] = round(float(angle), 1)
            break
# The clips read these from the skeleton (asset-library/clips.ts).
rig["hangL"], rig["hangR"] = hang["L"], hang["R"]
# What the brief says the figure holds, for the prop built in its hand (asset-library/props.ts): "staff:R:2.1".
brief_file = os.path.join(out_dir, "character.json")
holds = (json.load(open(brief_file)) if os.path.exists(brief_file) else {}).get("holds")
if holds:
    rig["holds"] = f"{holds['what']}:{holds.get('hand', 'R')}:{holds.get('length', 2)}" + (":rod" if holds.get("rod") else ":fist" if holds.get("fist") else "") + (f":{holds['palm']}" if holds.get("palm") else "")
if tunnel:
    # The middle of the grip is where the wrist is along the rod, not the rod's own middle: more of a rod may show at
    # one end. Written as glTF has it, y up, since that is where it is read (props.ts).
    wrist_at = np.array(at[f"hand{(holds or {}).get('hand', 'R')}"][:])
    grip_at = tunnel["middle"] + tunnel["runs"] * float((wrist_at - tunnel["middle"]) @ tunnel["runs"])
    as_gltf = lambda v: [float(v[0]), float(v[2]), float(-v[1])]
    rig["tunnel"] = as_gltf(grip_at) + as_gltf(tunnel["runs"]) + [tunnel["wide"]]

bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
# A point the stand-in's weights missed is patched the same way, so nothing is left behind.
patched = patch(body)
unweighted = len(body.data.vertices) - weighted(body)
most = max((sum(1 for g in v.groups if g.weight > 1e-4) for v in body.data.vertices), default=0)
body.parent = rig
skin = body.modifiers.new("skeleton", "ARMATURE")
skin.object = rig

# ── Every bone square to the world at rest: straight up, its z the way the figure faces ──
active(rig)
bpy.ops.object.mode_set(mode="EDIT")
for eb in arm.edit_bones:
    eb.use_connect = False
    eb.tail = eb.head + Vector((0, 0, 0.06))
    eb.align_roll(Vector((0, -1, 0)))
bpy.ops.object.mode_set(mode="OBJECT")


# ── Copies for near and far ──
def read_glb(path):
    with open(path, "rb") as f:
        f.read(12)
        (size,) = struct.unpack("<I", f.read(4))
        f.read(4)
        return json.loads(f.read(size))


# The images that colour the body: whatever feeds the base colour of its materials.
colour = set()
for m in body.data.materials:
    if not m or not m.use_nodes:
        continue
    for shader in [n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"]:
        trail = [link.from_node for link in shader.inputs["Base Color"].links]
        while trail:
            node = trail.pop()
            if node.type == "TEX_IMAGE" and node.image:
                colour.add(node.image.name)
            trail += [link.from_node for socket in node.inputs for link in socket.links]

# ── The face, from the sheet ──
# A generator makes its figure from the sheet's front view and then paints it again from memory: a face that was sharp
# on the sheet comes back soft, with muddy eyes. The model is the sheet's shape seen from in front, so the sheet's own
# pixels can be laid back onto whatever of the head faces forward. `"face": "sheet"` in the brief asks for it.
painted = None
if (json.load(open(brief_file)) if os.path.exists(brief_file) else {}).get("face") in ("sheet", "close") and colour:
    beside = os.path.dirname(os.path.abspath(spec_file))

    def picture(file):
        loaded = bpy.data.images.load(os.path.join(beside, file))
        w, h = loaded.size
        a = np.empty(w * h * 4, dtype=np.float32)
        loaded.pixels.foreach_get(a)
        bpy.data.images.remove(loaded)
        return a.reshape(h, w, 4)[::-1], w, h  # top row first, as the joints are counted

    # The first figures' joints files name the sheet as it was once called, with the figure's name before it.
    S, sw, sh = picture(spec["front"] if os.path.exists(os.path.join(beside, spec["front"])) else "apose-front.png")
    # The head painted close and fitted to the sheet (face.py), if there is one: the sheet's head, several times the
    # size. Inside its rectangle the head is painted from it, and the face's own relief is smoothed under the paint.
    close = json.load(open(os.path.join(beside, "face.json"))) if os.path.exists(os.path.join(beside, "apose-face.png")) else None
    # A model's head is not the sheet's head: its eyes and mouth may lie a centimetre from the sheet's, and a face laid
    # on by the sheet's measure then has two brows and a smeared nose (the third Wollandora). So the model's own face
    # is drawn out flat, as the sheet sees it (head-own.png, below), face.py finds its features and pulls the close
    # head onto them (apose-face-fit.png), and the rig is run again and paints from that. Fitted, nothing slips.
    fitted = bool(close) and "fitFace" in close and os.path.exists(os.path.join(beside, "apose-face-fit.png"))
    if close:
        F, fw, fh = picture("apose-face-fit.png" if fitted else "apose-face.png")
        if fitted:
            close["face"] = close["fitFace"]
    patches = []
    # paint.py, which runs this painting on a model another rigger rigged, asks for the face alone. Such a model has
    # hair, a scarf and a quiver of its own that do not lie where the sheet has them, and the sheet laid over them is
    # a second scarf beside the first.
    only_face = bool(globals().get("ONLY_FACE"))
    # Where the head's middle is across the sheet: the middle of the figure in its topmost rows.
    grey = np.median(np.concatenate([S[:12, :12, :3].reshape(-1, 3), S[:12, -12:, :3].reshape(-1, 3)]), axis=0)
    figure_mask = np.abs(S[:, :, :3] - grey).sum(axis=2) > 0.19
    crown_rows = figure_mask[int(top) : int(top + 0.07 * (bottom - top))]
    across = np.flatnonzero(crown_rows.any(axis=0))
    middle = (across.min() + across.max()) / 2 if len(across) else centre
    image = bpy.data.images[sorted(colour)[0]]
    tw, th = image.size
    T = np.empty(tw * th * 4, dtype=np.float32)
    image.pixels.foreach_get(T)
    T = T.reshape(th, tw, 4)
    mesh = body.data
    mesh.calc_loop_triangles()
    n = len(mesh.loop_triangles)
    tri_loops = np.empty(n * 3, dtype=np.int32)
    tri_verts = np.empty(n * 3, dtype=np.int32)
    tri_normal = np.empty(n * 3, dtype=np.float32)
    mesh.loop_triangles.foreach_get("loops", tri_loops)
    mesh.loop_triangles.foreach_get("vertices", tri_verts)
    mesh.loop_triangles.foreach_get("normal", tri_normal)
    uvs = np.empty(len(mesh.loops) * 2, dtype=np.float32)
    mesh.uv_layers.active.data.foreach_get("uv", uvs)
    uvs = uvs.reshape(-1, 2)[tri_loops].reshape(n, 3, 2) * np.array([tw, th], dtype=np.float32)
    V = coords(mesh)[tri_verts].reshape(n, 3, 3)
    facing = -tri_normal.reshape(n, 3)[:, 1]
    # The head, from the neck up, and only what looks forward.
    neck = at["neck"].z
    head = (V[:, :, 2].min(axis=1) > neck) & (facing > 0.12)
    # A model is not quite the sheet's shape: its nose may stand a few millimetres from where the sheet has it, and a
    # nose painted beside a nose is two noses (the owner, 2026-11-15: "a weird double image of the nose"). The tip of
    # the model's nose is the point of its face farthest forward, and the sheet's is known (face.py). The paint is
    # moved by the difference, over the face.
    slip = np.zeros(2, dtype=np.float32)
    face_front = None
    if close:
        # The model's own face, flat, in the close head's frame: every triangle of the head that looks forward, drawn
        # where the sheet would see it with the colour the generator gave it, nearest in front.
        cx0, cy0, cx1, cy1 = close["rect"]
        Kc = close["scale"]
        ow, oh = (cx1 - cx0) * Kc, (cy1 - cy0) * Kc
        own = np.tile(grey.astype(np.float32), (oh, ow, 1))
        deep = np.full((oh, ow), np.inf, dtype=np.float32)
        for k in np.flatnonzero((V[:, :, 2].min(axis=1) > neck - 0.03) & (facing > 0.02)):
            qx = (middle + V[k, :, 0] / px - cx0) * Kc
            qy = (bottom - V[k, :, 2] / px - cy0) * Kc
            x0, x1 = max(0, int(np.floor(qx.min()))), min(ow - 1, int(np.ceil(qx.max())))
            y0, y1 = max(0, int(np.floor(qy.min()))), min(oh - 1, int(np.ceil(qy.max())))
            area = (qx[1] - qx[0]) * (qy[2] - qy[0]) - (qx[2] - qx[0]) * (qy[1] - qy[0])
            if abs(area) < 1e-6 or x1 < x0 or y1 < y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            b1 = ((gx - qx[0]) * (qy[2] - qy[0]) - (qx[2] - qx[0]) * (gy - qy[0])) / area
            b2 = ((qx[1] - qx[0]) * (gy - qy[0]) - (gx - qx[0]) * (qy[1] - qy[0])) / area
            b0 = 1 - b1 - b2
            far = b0 * V[k, 0, 1] + b1 * V[k, 1, 1] + b2 * V[k, 2, 1]
            hit = (b0 >= -0.02) & (b1 >= -0.02) & (b2 >= -0.02) & (far < deep[y0 : y1 + 1, x0 : x1 + 1])
            if not hit.any():
                continue
            tu = np.clip((b0 * uvs[k, 0, 0] + b1 * uvs[k, 1, 0] + b2 * uvs[k, 2, 0]).astype(np.int32), 0, tw - 1)
            tv = np.clip((b0 * uvs[k, 0, 1] + b1 * uvs[k, 1, 1] + b2 * uvs[k, 2, 1]).astype(np.int32), 0, th - 1)
            own[y0 : y1 + 1, x0 : x1 + 1][hit] = T[tv, tu, :3][hit]
            deep[y0 : y1 + 1, x0 : x1 + 1][hit] = far[hit]
        drawn = bpy.data.images.new("head-own", ow, oh)
        drawn.pixels.foreach_set(np.concatenate([own[::-1], np.ones((oh, ow, 1), dtype=np.float32)], axis=2).reshape(-1))
        drawn.filepath_raw = os.path.join(beside, "head-own.png")
        drawn.file_format = "PNG"
        drawn.save()
        bpy.data.images.remove(drawn)
        del own, deep
    if close and "face" in close and "nose" in close:
        ox, oy, rx, ry = close["face"]
        C = V.mean(axis=1)
        csx, csy = middle + C[:, 0] / px, bottom - C[:, 2] / px
        core = (((csx - ox) / rx) ** 2 + ((csy - oy) / ry) ** 2 < 0.36) & (V[:, :, 2].min(axis=1) > neck)
        if core.any():
            tip = V[core].reshape(-1, 3)
            tip = tip[np.argmin(tip[:, 1])]
            face_front = float(tip[1])
            found = np.array([close["nose"][0] - (middle + tip[0] / px), close["nose"][1] - (bottom - tip[2] / px)], dtype=np.float32)
            # Further than a centimetre and a half is not a slip but a wrong point: left alone. Fitted, there is none.
            if not fitted and np.hypot(*found) * px < 0.015:
                slip = found
            # Within the face, everything on its front is painted, however it is turned: the underside of the nose
            # looks down, and left to the generator it kept a second pair of nostrils. The back of the head lies
            # behind the same oval, and is told from the face by how far back it is.
            near = (((csx - ox) / rx) ** 2 + ((csy - oy) / ry) ** 2 < 1.0) & (V[:, :, 1].min(axis=1) < face_front + 0.06 * H / 1.8) & (facing > -0.7)
            head = head | (near & (V[:, :, 2].min(axis=1) > neck))
            if only_face:
                # A little past the oval's edge, where the paint fades out.
                head = (((csx - ox) / rx) ** 2 + ((csy - oy) / ry) ** 2 < 1.3) & (V[:, :, 1].min(axis=1) < face_front + 0.06 * H / 1.8) & (facing > -0.7) & (V[:, :, 2].min(axis=1) > neck)
    texels = 0
    for k in np.flatnonzero(head):
        (u0, v0), (u1, v1), (u2, v2) = uvs[k]
        x0, x1 = int(np.floor(min(u0, u1, u2))) - 1, int(np.ceil(max(u0, u1, u2))) + 1
        y0, y1 = int(np.floor(min(v0, v1, v2))) - 1, int(np.ceil(max(v0, v1, v2))) + 1
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, tw - 1), min(y1, th - 1)
        area = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0)
        if abs(area) < 1e-6 or x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        b1 = ((gx - u0) * (v2 - v0) - (u2 - u0) * (gy - v0)) / area
        b2 = ((u1 - u0) * (gy - v0) - (gx - u0) * (v1 - v0)) / area
        b0 = 1 - b1 - b2
        # A texel's width past each edge is painted too, or the seams show as the old colour.
        inside = (b0 > -0.6 / max(1.0, abs(area) ** 0.5)) & (b1 > -0.6 / max(1.0, abs(area) ** 0.5)) & (b2 > -0.6 / max(1.0, abs(area) ** 0.5))
        if not inside.any():
            continue
        P = b0[..., None] * V[k, 0] + b1[..., None] * V[k, 1] + b2[..., None] * V[k, 2]
        sx = middle + P[..., 0] / px
        sy = bottom - P[..., 2] / px
        within = None
        if face_front is not None:
            # How far out of the face's oval each point is: 0 at its middle, 1 at its edge.
            out_of = ((sx - ox) / rx) ** 2 + ((sy - oy) / ry) ** 2
            moved = np.clip(1.7 - out_of, 0, 1)
            sx, sy = sx + slip[0] * moved, sy + slip[1] * moved
            within = np.clip(1.15 - out_of, 0, 1) ** 0.5
        sx = np.clip(sx, 0, sw - 1.001)
        sy = np.clip(sy, 0, sh - 1.001)
        ix, iy = sx.astype(np.int32), sy.astype(np.int32)
        fx, fy = (sx - ix)[..., None], (sy - iy)[..., None]
        seen = (S[iy, ix, :3] * (1 - fx) + S[iy, ix + 1, :3] * fx) * (1 - fy) + (S[iy + 1, ix, :3] * (1 - fx) + S[iy + 1, ix + 1, :3] * fx) * fy
        oval = None
        if close:
            cx0, cy0, cx1, cy1 = close["rect"]
            # Eased in over the rectangle's edge, so no line shows where the close head begins.
            edge = np.clip(np.minimum.reduce([sx - cx0, cx1 - sx, sy - cy0, cy1 - sy]) / 6.0, 0, 1)[..., None]
            qx = np.clip((sx - cx0) * close["scale"], 0, fw - 1.001)
            qy = np.clip((sy - cy0) * close["scale"], 0, fh - 1.001)
            jx, jy = qx.astype(np.int32), qy.astype(np.int32)
            gx2, gy2 = (qx - jx)[..., None], (qy - jy)[..., None]
            near = (F[jy, jx, :3] * (1 - gx2) + F[jy, jx + 1, :3] * gx2) * (1 - gy2) + (F[jy + 1, jx, :3] * (1 - gx2) + F[jy + 1, jx + 1, :3] * gx2) * gy2
            seen = seen * (1 - edge) + near * edge
            if "face" in close:
                ox, oy, rx, ry = close["face"]
                oval = np.clip(1.15 - ((sx - ox) / rx) ** 2 - ((sy - oy) / ry) ** 2, 0, 1) ** 0.5
        # Most where the head looks straight out of the sheet, none where it turns away, and eased in above the neck.
        turn = np.clip((facing[k] - 0.12) / 0.4, 0, 1) ** 1.5
        if within is not None and P[..., 1].min() < face_front + 0.06 * H / 1.8:
            turn = np.maximum(turn, within)
        if only_face:
            turn = within if within is not None else 0.0
        rise = np.clip((P[..., 2] - neck) / (0.025 * H), 0, 1)
        # Never the sheet's grey: a point of the model that falls outside the painted figure keeps its own colour.
        on_figure = figure_mask[iy, ix] & figure_mask[iy + 1, ix + 1]
        # A fitted head lies where the model's face is, not where the sheet's is: Thalbern's stood 3 cm to one side,
        # and the sheet's grey beside its head left that side of his face unpainted, to a ragged line down the nose.
        # Inside the fitted face's oval the paint is the fitted head's, and all of it is face.
        if fitted and face_front is not None:
            on_figure = on_figure | (out_of < 1.15)
        w = (turn * rise * inside * on_figure)[..., None]
        patch = T[y0 : y1 + 1, x0 : x1 + 1, :3]
        T[y0 : y1 + 1, x0 : x1 + 1, :3] = patch * (1 - w) + seen * w
        if oval is not None:
            patches.append((y0, y1, x0, x1, w * oval[..., None]))
        texels += int(inside.sum())
    image.pixels.foreach_set(T.reshape(-1))
    image.update()
    painted = {"triangles": int(head.sum()), "texels": texels, "sheetMiddle": float(middle), "close": bool(close), "fitted": fitted, "noseSlipMm": [round(float(v * px * 1000), 1) for v in slip]}
    del S, T
    # Under a face painted from a picture, the generator's own relief and shine are a second face a little out of
    # place: eyelids that glint, a second lip line. They are smoothed away where the face is, and left in the hair.
    others = set()
    for m in body.data.materials:
        for node in m.node_tree.nodes if m and m.use_nodes else []:
            if node.type == "TEX_IMAGE" and node.image and node.image.name not in colour:
                others.add(node.image.name)
    for name in sorted(others) if patches else []:
        other = bpy.data.images[name]
        if tuple(other.size) != (tw, th):
            continue
        R = np.empty(tw * th * 4, dtype=np.float32)
        other.pixels.foreach_get(R)
        R = R.reshape(th, tw, 4)
        tone = np.median(R[::64, ::64, :3].reshape(-1, 3), axis=0)
        relief = tone[2] > 0.8 and abs(tone[0] - 0.5) < 0.15 and abs(tone[1] - 0.5) < 0.15
        for y0, y1, x0, x1, w in patches:
            patch = R[y0 : y1 + 1, x0 : x1 + 1, :3]
            if relief:
                # A flat normal, most of the way.
                R[y0 : y1 + 1, x0 : x1 + 1, :3] = patch * (1 - 0.85 * w) + np.array([0.5, 0.5, 1.0], dtype=np.float32) * 0.85 * w
            else:
                # glTF keeps roughness in green and metal in blue: skin is neither wet nor metal.
                R[y0 : y1 + 1, x0 : x1 + 1, 1:2] = patch[..., 1:2] * (1 - w) + 0.6 * w
                R[y0 : y1 + 1, x0 : x1 + 1, 2:3] = patch[..., 2:3] * (1 - w)
        other.pixels.foreach_set(R.reshape(-1))
        other.update()
        del R

made = []
for i, (triangles, width, colour_width) in enumerate(LODS):
    copy = body.copy()
    copy.data = body.data.copy()
    copy.name = f"{name}-lod{i}"
    bpy.context.scene.collection.objects.link(copy)
    active(copy)
    if triangles and triangles < source_triangles:
        thin = copy.modifiers.new("thin", "DECIMATE")
        thin.ratio = triangles / source_triangles
        bpy.ops.object.modifier_move_to_index(modifier=thin.name, index=0)
        bpy.ops.object.modifier_apply(modifier=thin.name)
    for img in bpy.data.images:
        most = colour_width if img.name in colour else width
        if img.size[0] > most:
            img.scale(most, max(1, round(img.size[1] * most / img.size[0])))
    bpy.ops.object.select_all(action="DESELECT")
    copy.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = copy
    path = os.path.join(out_dir, f"{prefix}lod{i}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_skins=True,
        export_yup=True,
        export_image_format="WEBP",
        export_image_quality=92 if i == 0 else 85,
        export_tangents=False,
        export_extras=True,
    )
    g = read_glb(path)
    joints = [g["nodes"][j] for j in g["skins"][0]["joints"]]
    turned = [n["name"] for n in joints if any(abs(a - b) > 1e-4 for a, b in zip(n.get("rotation", [0, 0, 0, 1]), [0, 0, 0, 1]))]
    made.append(
        {
            "file": os.path.basename(path),
            "megabytes": round(os.path.getsize(path) / 1e6, 2),
            "triangles": sum(len(p.vertices) - 2 for p in copy.data.polygons),
            "texture": width,
            "colour": colour_width,
            "joints": len(joints),
            "turnedAtRest": turned,
        }
    )
    bpy.data.objects.remove(copy, do_unlink=True)

report = {
    "name": name,
    "source": os.path.basename(src),
    "height": H,
    "sourceTriangles": source_triangles,
    "weldedPoints": welded,
    "quarterTurns": quarter,
    "weights": {"solve": solve, "standIn": stand_in, "patched": patched, "unweighted": unweighted, "mostBonesOnAPoint": most},
    "slungPoints": slung,
    "hang": hang,
    "holds": holds or None,
    "tunnel": {"faces": tunnel["faces"], "wideCm": round(tunnel["wide"] * 200, 1), "longCm": round(tunnel["long"] * 100, 1), "runs": [round(float(v), 2) for v in tunnel["runs"]]} if tunnel else None,
    "faceFromSheet": painted,
    "bones": BONES,
    "lods": made,
}
json.dump(report, open(os.path.join(out_dir, f"{name}.json" if prefix else "rig.json"), "w"), indent=2)
print("RIG " + json.dumps(report))
