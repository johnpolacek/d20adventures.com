# Finds a character's joints on its A-pose front, so the joints file needs no hand.
#
#   uv run --python 3.12 --with mediapipe==0.10.14 --with numpy --with pillow asset-library/pipeline/joints.py asset-library/characters/branka 1.38 [--write] [--force]
#
# In:  <folder>/apose-front.png, a photoreal figure on flat grey (the pose sheet).
# Out: the joints, printed. With --write, <folder>/joints.json is written, unless one is already there (--force
#      replaces it). When one is there, how far each found joint lies from it is printed, in centimetres.
#
# A pose model finds shoulders, elbows, wrists, hips, knees, ankles and toes. The trunk and the head are placed between
# them by fixed shares, and the top of the head is the top of the figure against the grey.

import json
import os
import sys

import mediapipe as mp
import numpy as np
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith("--")]
folder, height = args[0].rstrip("/"), float(args[1])
ident = os.path.basename(folder)
file = f"{folder}/apose-front.png"
image = np.asarray(Image.open(file).convert("RGB"))
H, W = image.shape[:2]

with mp.solutions.pose.Pose(static_image_mode=True, model_complexity=2, min_detection_confidence=0.3) as pose:
    found = pose.process(image)
if not found.pose_landmarks:
    sys.exit(f"No figure found in {file}")
lm = found.pose_landmarks.landmark
P = lambda i: np.array([lm[i].x * W, lm[i].y * H])
seen = min(lm[i].visibility for i in (11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28))

# The figure against the grey: whatever is far from the colour of the corners.
ground = np.median(np.concatenate([image[:12, :12].reshape(-1, 3), image[:12, -12:].reshape(-1, 3)]), axis=0)
figure = np.abs(image.astype(np.int16) - ground).sum(axis=2) > 48

J = {}
for side, (sh, el, wr, ix, hp, kn, an, toe) in {"L": (11, 13, 15, 19, 23, 25, 27, 31), "R": (12, 14, 16, 20, 24, 26, 28, 32)}.items():
    J[f"upperarm{side}"] = P(sh)
    J[f"forearm{side}"] = P(el)
    J[f"hand{side}"] = P(wr)
    # The model marks the first knuckle. The fingertip is as far again along the hand, and a little more.
    J[f"handTip{side}"] = P(wr) + (P(ix) - P(wr)) * 2.1
    J[f"thigh{side}"] = P(hp)
    J[f"shin{side}"] = P(kn)
    J[f"foot{side}"] = P(an)
    J[f"toe{side}"] = P(toe)
shoulders = (P(11) + P(12)) / 2
pelvis = (P(23) + P(24)) / 2
mouth = (P(9) + P(10)) / 2
trunk = pelvis - shoulders
J["hips"] = pelvis - trunk * 0.03
J["spine"] = shoulders + trunk * 0.62
J["chest"] = shoulders + trunk * 0.24
J["neck"] = np.array([shoulders[0], mouth[1] + (shoulders[1] - mouth[1]) * 0.55])
J["head"] = np.array([shoulders[0], mouth[1] + (shoulders[1] - mouth[1]) * 0.15])
band = figure[:, int(mouth[0] - 0.06 * W) : int(mouth[0] + 0.06 * W)].any(axis=1)
J["headTop"] = np.array([shoulders[0], float(np.argmax(band))])
# The trunk stands on one line: a pose model leans it toward whichever shoulder it read higher.
for name in ("hips", "spine", "chest", "neck", "head", "headTop"):
    J[name][0] = (shoulders[0] + pelvis[0]) / 2

order = ["hips", "spine", "chest", "neck", "head", "headTop"] + [f"{part}{side}" for side in "LR" for part in ("upperarm", "forearm", "hand", "handTip")] + [f"{part}{side}" for side in "LR" for part in ("thigh", "shin", "foot", "toe")]
out = {"height": height, "front": "apose-front.png", "back": "apose-back.png", "joints": {k: [int(round(J[k][0])), int(round(J[k][1]))] for k in order}}

target = f"{folder}/joints.json"
report = {"id": ident, "leastSure": round(float(seen), 2)}
if os.path.exists(target):
    marked = json.load(open(target))["joints"]
    span = max(marked["toeL"][1], marked["toeR"][1]) - marked["headTop"][1]
    off = {k: round(float(np.hypot(*(np.array(marked[k]) - J[k]))) / span * height * 100, 1) for k in order}
    report["offMarksCm"] = off
    report["worstCm"] = max(off.values())
    report["meanCm"] = round(sum(off.values()) / len(off), 1)
if "--write" in sys.argv:
    # A file marked by hand is kept unless --force says to replace it.
    if os.path.exists(target) and "--force" not in sys.argv:
        report["kept"] = "figures file already there: --force replaces it"
    else:
        json.dump(out, open(target, "w"), indent=2)
print("JOINTS " + json.dumps({**report, "joints": out["joints"]}))
