# Paints the sheet's face onto a model that another rigger rigged (pilot.ts), as rig.py paints it onto its own.
#
#   D=asset-library/characters/thalbern-rodin-meshy
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P asset-library/pipeline/paint.py -- $D/pilot/rigged.glb asset-library/characters/thalbern-rodin $D/pilot
#
# In:  a GLB standing in an A-pose, rigged or not, and the folder of the sheet it was made from: joints.json, the brief
#      with "face" in it, apose-front.png, and face.py's apose-face.png and face.json.
# Out: colour.png, normal.png and rough.png in the folder named last, the model's textures with the face painted. The
#      model itself is not written again: its rig and clips are another's, and pilot.ts puts the textures into it.
#      head-own.png beside the sheet, for face.py to fit the close head to, as rig.py leaves it.
#
# The painting is rig.py's own, read out of that file and run here, so a face is painted one way. It wants what rig.py
# has by then: the mesh as one object, on the ground at its height, facing -y, and the sheet's measures. When a figure
# made this way is the pipeline's, the painting moves to a file of its own and both read it.

import json
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

src, sheet_dir, out_dir = sys.argv[sys.argv.index("--") + 1 :][:3]
# The colour is painted this wide, as rig.py keeps its nearest copy: a face is a hundred pixels of a 2048 texture.
WIDE = 4096
spec_file = os.path.join(sheet_dir, "joints.json")
brief_file = os.path.join(sheet_dir, "character.json")
spec = json.load(open(spec_file))
H = float(spec["height"])


def coords(mesh):
    a = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    mesh.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)


# ── The mesh as rig.py has it: one object, at rest, on the ground at its height, facing -y ──
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
quarter += int(spec.get("turn", 0))
body.data.transform(Matrix.Rotation(quarter * np.pi / 2, 4, "Z"))
body.data.update()

co = coords(body.data)
z0, z1 = float(co[:, 2].min()), float(co[:, 2].max())
crown = co[co[:, 2] > z0 + 0.92 * (z1 - z0)]
co = (co - np.array([crown[:, 0].mean(), 0, z0], dtype=np.float32)) * (H / (z1 - z0))
body.data.vertices.foreach_set("co", co.reshape(-1))
body.data.update()

# ── The sheet's measures, as rig.py takes them from the joints ──
J = spec["joints"]
top = J["headTop"][1]
bottom = max(J["toeL"][1], J["toeR"][1]) + spec.get("sole", 6)
px = H / (bottom - top)
centre = J["hips"][0]
at = {"neck": Vector((0, 0, (bottom - J["neck"][1]) * px))}


# ── The model's textures, by what each feeds ──
def feeding(socket):
    found = set()
    for m in body.data.materials:
        if not m or not m.use_nodes:
            continue
        for shader in [n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"]:
            trail = [link.from_node for link in shader.inputs[socket].links]
            while trail:
                node = trail.pop()
                if node.type == "TEX_IMAGE" and node.image:
                    found.add(node.image.name)
                trail += [link.from_node for s in node.inputs for link in s.links]
    return sorted(found)


textures = {"colour": feeding("Base Color"), "normal": feeding("Normal"), "rough": feeding("Roughness")}
was = {img.name: tuple(img.size) for img in bpy.data.images}
# Every texture as wide as the colour while the face is painted: rig.py smooths the relief under a face only in a
# texture the colour's size. One that came wider is brought down to it: Hi3D's are 8192 across, a gigabyte each as
# they are painted, and no figure keeps one wider than this.
for names in textures.values():
    for n in names:
        if bpy.data.images[n].size[0] != WIDE:
            bpy.data.images[n].scale(WIDE, WIDE)

# ── rig.py's painting ──
# The face alone: this model's hair, scarf and gear are its own, and are not where the sheet has them.
ONLY_FACE = True
rig = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "rig.py")).read()
begin, end = rig.index("# The images that colour the body"), rig.index("\nmade = []")
exec(compile("\n" * rig[:begin].count("\n") + rig[begin:end], "rig.py", "exec"))  # noqa: S102

# ── The textures, written out ──
os.makedirs(out_dir, exist_ok=True)
written = {}
for kind, names in textures.items():
    if not names:
        continue
    img = bpy.data.images[names[0]]
    # The colour stays wide. The others go back to the size they came in.
    if kind != "colour" and was[img.name][0] < WIDE:
        img.scale(*was[img.name])
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    out = bpy.data.images.new(kind, w, h, alpha=True)
    out.pixels.foreach_set(a)
    out.filepath_raw = os.path.join(out_dir, f"{kind}.png")
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    written[kind] = [w, h]

print("PAINT " + json.dumps({"faceFromSheet": painted, "quarterTurns": quarter, "textures": written}))  # noqa: F821
