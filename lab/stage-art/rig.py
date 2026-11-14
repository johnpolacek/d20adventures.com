# Rigs a generated character in headless Blender: one skeleton for every character, weights that follow the body, and
# lighter copies for far cameras.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P lab/stage-art/rig.py -- \
#       public/stage-lab/garlan-tripo-model.glb lab/stage-art/figures/garlan.json public/stage-lab garlan-rig
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
# Triangles and texture width for each copy. The first keeps the mesh as it came.
LODS = [(None, 2048), (20000, 1024), (6000, 512)]

src, spec_file, out_dir, name = sys.argv[sys.argv.index("--") + 1 :][:4]
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


made = []
for i, (triangles, width) in enumerate(LODS):
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
        if img.size[0] > width:
            img.scale(width, max(1, round(img.size[1] * width / img.size[0])))
    bpy.ops.object.select_all(action="DESELECT")
    copy.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = copy
    path = os.path.join(out_dir, f"{name}-lod{i}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_skins=True,
        export_yup=True,
        export_image_format="WEBP",
        export_image_quality=85,
        export_tangents=False,
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
    "bones": BONES,
    "lods": made,
}
json.dump(report, open(os.path.join(out_dir, f"{name}.json"), "w"), indent=2)
print("RIG " + json.dumps(report))
