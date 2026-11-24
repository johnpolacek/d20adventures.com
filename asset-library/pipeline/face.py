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
#   uv run ... asset-library/pipeline/face.py fit asset-library/characters/wollandora [--eyes=painted]
#
# crop: <folder>/head-crop.png, the sheet's head enlarged, and face.json, where it was cut from.
# warp: <folder>/apose-face.png, for rig.py to paint the head from, in place of the sheet.
# fit:  <folder>/apose-face-fit.png, that head pulled onto the model's own face as rig.py drew it out (head-own.png).
#       --eyes=painted keeps each eye as open as it was painted, for a model whose own are shut.

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


def pulled(picture, have, want, size):
    """A picture of a face pulled so that its points lie on another face's: whole, by size, turn and place, and the face
    itself triangle by triangle."""
    w, h = size
    M, _ = cv2.estimateAffinePartial2D(have, want, method=cv2.LMEDS)
    whole = cv2.warpAffine(picture, M, (w, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
    fine = whole.copy()
    tris = cv2.Subdiv2D((0, 0, w, h))
    inside = [(i, p) for i, p in enumerate(want) if 0 <= p[0] < w and 0 <= p[1] < h]
    for _, p in inside:
        tris.insert((float(p[0]), float(p[1])))
    index = {(round(float(p[0]), 2), round(float(p[1]), 2)): i for i, p in inside}
    for t in tris.getTriangleList():
        ids = [index.get((round(float(t[k]), 2), round(float(t[k + 1]), 2))) for k in (0, 2, 4)]
        if None in ids:
            continue
        dst, src = want[ids], have[ids]
        x, y, bw, bh = cv2.boundingRect(dst)
        if bw < 1 or bh < 1:
            continue
        to = cv2.getAffineTransform(src, dst - np.array([x, y], dtype=np.float32))
        patch = cv2.warpAffine(picture, to, (bw, bh), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
        mask = np.zeros((bh, bw), dtype=np.uint8)
        cv2.fillConvexPoly(mask, np.int32(np.round(dst - np.array([x, y]))), 255, lineType=cv2.LINE_AA)
        x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + bw, w), min(y + bh, h)
        m = (mask[y0 - y : y1 - y, x0 - x : x1 - x, None] / 255.0).astype(np.float32)
        fine[y0:y1, x0:x1] = (fine[y0:y1, x0:x1] * (1 - m) + patch[y0 - y : y1 - y, x0 - x : x1 - x] * m).astype(np.uint8)
    hull = cv2.convexHull(want).reshape(-1, 2)
    mid = hull.mean(axis=0)
    mask = np.zeros((h, w), dtype=np.float32)
    cv2.fillConvexPoly(mask, np.int32(mid + (hull - mid) * 0.96), 1.0, lineType=cv2.LINE_AA)
    mask = cv2.GaussianBlur(mask, (0, 0), w * 0.012)[..., None]
    return np.clip(whole.astype(np.float32) * (1 - mask) + fine.astype(np.float32) * mask, 0, 255).astype(np.uint8), hull, mid


# The rim of each eye, among the face model's 468 points.
EYES = (
    [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
)

if mode == "fit":
    # The close head, already the sheet's, pulled onto the model's own face as the rig drew it out (head-own.png).
    own = cv2.imread(f"{folder}/head-own.png")
    sharp = cv2.imread(f"{folder}/apose-face.png")
    A, B = (points(own) if own is not None else None), points(sharp)
    if A is None or B is None:
        spec.pop("fitFace", None)
        json.dump(spec, open(f"{folder}/face.json", "w"), indent=2)
        print("FACE " + json.dumps({"fitted": False, "why": "no face found in the model's own" if A is None else "no face found in the close head"}))
        sys.exit(0)
    # The model's own eyes, where its lids are: the middle of each and half its width and height, in the sheet's pixels.
    # pilot.ts smooths the lids there for a brief with "lids": "smooth".
    x0, y0 = spec["rect"][:2]
    spec["ownEyes"] = [[float(x0 + A[eye][:, 0].mean() / K), float(y0 + A[eye][:, 1].mean() / K), float(np.ptp(A[eye][:, 0]) / 2 / K), float(np.ptp(A[eye][:, 1]) / 2 / K)] for eye in EYES]
    if "--eyes=painted" in sys.argv:
        # A model can come with its eyes all but shut (Rodin's Thalbern), and an eye pulled onto those lids is a slit.
        # Each eye is set where the model's is, and keeps the opening it was painted with.
        M, _ = cv2.estimateAffinePartial2D(B, A, method=cv2.LMEDS)
        placed = B @ M[:, :2].T + M[:, 2]
        for eye in EYES:
            A[eye] = placed[eye] - placed[eye].mean(axis=0) + A[eye].mean(axis=0)
    out, hull, mid = pulled(sharp, B, A, (own.shape[1], own.shape[0]))
    cv2.imwrite(f"{folder}/apose-face-fit.png", out)
    x0, y0 = spec["rect"][:2]
    spec["fitFace"] = [float(x0 + mid[0] / K), float(y0 + mid[1] / K), float(np.ptp(hull[:, 0]) / 2 / K), float(np.ptp(hull[:, 1]) / 2 / K)]
    json.dump(spec, open(f"{folder}/face.json", "w"), indent=2)
    moved = np.linalg.norm(A - B, axis=1) / K
    print("FACE " + json.dumps({"fitted": True, "movedPxMean": round(float(moved.mean()), 1), "movedPxMost": round(float(moved.max()), 1)}))
    sys.exit(0)

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
# The tip of the nose on the sheet: the one point of a face a model's shape gives away, to set the paint by (rig.py).
spec["nose"] = [float(x0 + A[4][0] / K), float(y0 + A[4][1] / K)]
json.dump(spec, open(f"{folder}/face.json", "w"), indent=2)
print("FACE " + json.dumps({"size": [W, H], "eyesApart": round(float(np.linalg.norm(A[33] - A[263])), 1), "closeEyesApart": round(float(np.linalg.norm(B[33] - B[263])), 1)}))
