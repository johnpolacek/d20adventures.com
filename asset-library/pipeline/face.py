# A character's face, close: the head of the pose sheet enlarged with real detail, and laid back in the sheet's place.
#
#   uv run --python 3.12 --with mediapipe==0.10.14 --with numpy asset-library/pipeline/face.py crop asset-library/characters/wollandora
#   (build.ts has the image tool paint face.png from head-crop.png)
#   uv run ... asset-library/pipeline/face.py warp asset-library/characters/wollandora
#
# The sheet gives a face about 130 pixels across, and a camera goes up to it. A head painted on its own has five times
# that, but it is another picture: its eyes are not where the sheet's are, and the model is the sheet's shape. So the
# close head is pulled onto the sheet's by the 468 points a face model finds in both, triangle by triangle, and what
# comes out is the sheet's head, four times the size, with the close head's detail where the sheet's features are.
#
# crop: <folder>/head-crop.png, the sheet's head enlarged, and face.json, where it was cut from.
# warp: <folder>/apose-face.png, for rig.py to paint the head from, in place of the sheet.

import json
import sys

import cv2
import mediapipe as mp
import numpy as np

mode, folder = sys.argv[1], sys.argv[2].rstrip("/")
K = 4
sheet = cv2.imread(f"{folder}/apose-front.png")
J = json.load(open(f"{folder}/joints.json"))["joints"]


def points(image):
    with mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1, refine_landmarks=False, min_detection_confidence=0.2) as mesh:
        found = mesh.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
    if not found.multi_face_landmarks:
        return None
    h, w = image.shape[:2]
    return np.array([[p.x * w, p.y * h] for p in found.multi_face_landmarks[0].landmark], dtype=np.float32)


if mode == "crop":
    # The head and a margin: from above the crown to under the chin, as wide as it is tall.
    top, neck = J["headTop"][1], J["neck"][1]
    tall = (neck - top) * 1.12
    cx = J["head"][0]
    x0, y0 = int(round(cx - tall / 2)), int(round(top - tall * 0.04))
    x0, y0 = max(0, x0), max(0, y0)
    side = int(min(tall, sheet.shape[1] - x0, sheet.shape[0] - y0))
    crop = cv2.resize(sheet[y0 : y0 + side, x0 : x0 + side], (side * K, side * K), interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite(f"{folder}/head-crop.png", crop)
    json.dump({"rect": [x0, y0, x0 + side, y0 + side], "scale": K}, open(f"{folder}/face.json", "w"), indent=2)
    print("FACE " + json.dumps({"crop": [x0, y0, side], "found": points(crop) is not None}))
    sys.exit(0)

spec = json.load(open(f"{folder}/face.json"))
crop = cv2.imread(f"{folder}/head-crop.png")
close = cv2.imread(f"{folder}/face.png")
H, W = crop.shape[:2]
A, B = points(crop), points(close)
if A is None or B is None:
    sys.exit(f"No face found in {'the sheet' if A is None else 'face.png'}")

# The close head as a whole, set on the sheet's by size, turn and place: for the hair about the face.
M, _ = cv2.estimateAffinePartial2D(B, A, method=cv2.LMEDS)
whole = cv2.warpAffine(close, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)

# The face itself, triangle by triangle, so each feature lands on the sheet's.
fine = whole.copy()
tris = cv2.Subdiv2D((0, 0, W, H))
inside = [(i, p) for i, p in enumerate(A) if 0 <= p[0] < W and 0 <= p[1] < H]
for _, p in inside:
    tris.insert((float(p[0]), float(p[1])))
index = {(round(float(p[0]), 2), round(float(p[1]), 2)): i for i, p in inside}
for t in tris.getTriangleList():
    ids = [index.get((round(float(t[k]), 2), round(float(t[k + 1]), 2))) for k in (0, 2, 4)]
    if None in ids:
        continue
    dst, src = A[ids], B[ids]
    x, y, w, h = cv2.boundingRect(dst)
    if w < 1 or h < 1:
        continue
    to = cv2.getAffineTransform(src, dst - np.array([x, y], dtype=np.float32))
    patch = cv2.warpAffine(close, to, (w, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillConvexPoly(mask, np.int32(np.round(dst - np.array([x, y]))), 255, lineType=cv2.LINE_AA)
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, W), min(y + h, H)
    m = (mask[y0 - y : y1 - y, x0 - x : x1 - x, None] / 255.0).astype(np.float32)
    fine[y0:y1, x0:x1] = (fine[y0:y1, x0:x1] * (1 - m) + patch[y0 - y : y1 - y, x0 - x : x1 - x] * m).astype(np.uint8)


def feathered(shape, soft):
    mask = np.zeros((H, W), dtype=np.float32)
    cv2.fillConvexPoly(mask, np.int32(shape), 1.0, lineType=cv2.LINE_AA)
    return cv2.GaussianBlur(mask, (0, 0), soft)[..., None]


hull = cv2.convexHull(A).reshape(-1, 2)
middle = hull.mean(axis=0)
face = feathered(middle + (hull - middle) * 0.94, W * 0.012)
# The close head's colour, brought to the sheet's inside the face: the two were lit alike and still differ a shade.
inner = face[..., 0] > 0.5
for c in range(3):
    a, b = crop[..., c][inner].astype(np.float32), fine[..., c][inner].astype(np.float32)
    fine[..., c] = np.clip((fine[..., c].astype(np.float32) - b.mean()) * (a.std() / max(b.std(), 1e-3)) + a.mean(), 0, 255).astype(np.uint8)
    whole[..., c] = np.clip((whole[..., c].astype(np.float32) - b.mean()) * (a.std() / max(b.std(), 1e-3)) + a.mean(), 0, 255).astype(np.uint8)
# About the face, the close head as a whole, out to a head and a half: its hair has the detail the sheet's lacks. Past
# that the sheet, so the picture's edges are the sheet's own.
around = feathered(middle + (hull - middle) * 1.45, W * 0.05)
out = crop.astype(np.float32) * (1 - around) + whole.astype(np.float32) * around
out = out * (1 - face) + fine.astype(np.float32) * face
cv2.imwrite(f"{folder}/apose-face.png", np.clip(out, 0, 255).astype(np.uint8))
# Where the face lies on the sheet, as an oval: its middle and its half width and half height, in the sheet's pixels.
x0, y0 = spec["rect"][:2]
spec["face"] = [float(x0 + middle[0] / K), float(y0 + middle[1] / K), float(np.ptp(hull[:, 0]) / 2 / K), float(np.ptp(hull[:, 1]) / 2 / K)]
json.dump(spec, open(f"{folder}/face.json", "w"), indent=2)
print("FACE " + json.dumps({"size": [W, H], "eyesApart": round(float(np.linalg.norm(A[33] - A[263])), 1), "closeEyesApart": round(float(np.linalg.norm(B[33] - B[263])), 1)}))
