#!/usr/bin/env python3
"""Simulate what a phone camera produces when pointed at another phone's calendar.

Input : the repo's calendar fixtures (flat screenshots with known marked days).
Output: JPEG "photos" at three difficulty levels, a 720px-wide copy of each (what the
        app's current picker path feeds the reader), and ground truth including the
        homography from fixture pixels to photo pixels.

Effects modelled: 3-D pose (tilt, in-plane rotation, distance, off-centre), bezel,
background table, screen emission gain and colour cast, glass glare and haze, moire
from the pixel grid, defocus and motion blur, sensor noise, vignette, JPEG.
"""
import json, math, sys
from pathlib import Path

import cv2
import numpy as np

FIX = Path(__file__).resolve().parents[2] / "packages/core/test/fixtures/calendars"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
PER_LEVEL = int(sys.argv[2]) if len(sys.argv) > 2 else 2
W, H = 2268, 3024  # 9 MP portrait, like a binned phone photo
F = 2250.0  # focal length in px (about a 26 mm equivalent)

LEVELS = {
    # tilt/rot in degrees; fill = phone height as a fraction of frame height
    "easy": dict(tilt=5, rot=3, fill=(0.80, 0.95), close=0.25, blur=(0.6, 1.0), glare=(0.0, 0.12),
                 moire=(0.0, 0.03), noise=(1, 3), cast=0.03, motion=0, haze=(0.0, 0.03)),
    "typical": dict(tilt=14, rot=8, fill=(0.75, 1.05), close=0.5, blur=(1.0, 1.9), glare=(0.10, 0.35),
                    moire=(0.02, 0.06), noise=(2, 6), cast=0.07, motion=6, haze=(0.02, 0.07)),
    "hard": dict(tilt=26, rot=14, fill=(0.70, 1.15), close=0.6, blur=(1.8, 3.0), glare=(0.30, 0.60),
                 moire=(0.04, 0.10), noise=(4, 9), cast=0.12, motion=12, haze=(0.05, 0.12)),
}


def rrect(h, w, r):
    m = np.zeros((h, w), np.float32)
    cv2.rectangle(m, (r, 0), (w - r - 1, h - 1), 1, -1)
    cv2.rectangle(m, (0, r), (w - 1, h - r - 1), 1, -1)
    for cx, cy in ((r, r), (w - r - 1, r), (r, h - r - 1), (w - r - 1, h - r - 1)):
        cv2.circle(m, (cx, cy), r, 1, -1)
    return cv2.GaussianBlur(m, (0, 0), 1.2)


def rot(rx, ry, rz):
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Rx @ Ry


def background(rng):
    base = np.array(rng.choice([(70, 90, 120), (205, 205, 200), (40, 40, 44), (120, 125, 130), (160, 175, 190), (90, 100, 110)]),
                    np.float32)  # BGR
    lo = rng.normal(0, 1, (6, 5)).astype(np.float32)
    lo = cv2.resize(lo, (W, H), interpolation=cv2.INTER_CUBIC)
    tex = cv2.GaussianBlur(rng.normal(0, 1, (H // 4, W // 4)).astype(np.float32), (0, 0), 1.5)
    tex = cv2.resize(tex, (W, H))
    bg = base[None, None, :] * (1 + 0.12 * lo[..., None] + 0.05 * tex[..., None])
    return np.clip(bg, 0, 255)


def render(src, rng, L):
    sh, sw = src.shape[:2]
    k = 1170 / sw
    scr = cv2.resize(src, (round(sw * k), round(sh * k)), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255
    h, w = scr.shape[:2]

    # What the glass emits: dimmer and tinted compared with the screenshot file.
    gain = rng.uniform(0.62, 0.95)
    cast = np.array([1 + rng.uniform(-L["cast"], L["cast"]) for _ in range(3)])
    cast[0] *= 1 + rng.uniform(0, L["cast"] * 1.5)  # blue-ish whites are typical
    scr = np.clip(scr * gain * cast[None, None, :], 0, 1) ** rng.uniform(1.0, 1.18)

    bez = 30
    sw_, sh_ = w + 2 * bez, h + 2 * bez
    sprite = np.zeros((sh_, sw_, 3), np.float32) + 0.015
    sprite[bez:bez + h, bez:bez + w] = scr
    phone_mask = rrect(sh_, sw_, 120)
    screen_mask = np.zeros((sh_, sw_), np.float32)
    screen_mask[bez:bez + h, bez:bez + w] = rrect(h, w, 95)

    # Pose.
    close = rng.random() < L["close"]
    tilt = math.radians(L["tilt"])
    rx = rng.uniform(-tilt, tilt)
    ry = rng.uniform(-tilt, tilt)
    rz = math.radians(rng.uniform(-L["rot"], L["rot"]))
    R = rot(rx, ry, rz)
    if close:
        # Moved in to fill the frame with the calendar; the phone's ends fall outside.
        width_frac = rng.uniform(0.80, 1.02)
        d = F * sw_ / (width_frac * W)
        ty = rng.uniform(-0.10, 0.25) * sh_ * 0.5
        tx = rng.uniform(-0.03, 0.03) * W * d / F
    else:
        fill = rng.uniform(*L["fill"])
        d = F * sh_ / (fill * H)
        tx = rng.uniform(-0.05, 0.05) * W * d / F
        ty = rng.uniform(-0.04, 0.04) * H * d / F
    K = np.array([[F, 0, W / 2], [0, F, H / 2], [0, 0, 1]])
    Hsp = K @ np.column_stack([R[:, 0], R[:, 1], np.array([tx, ty, d])]) @ np.array([[1, 0, -sw_ / 2], [0, 1, -sh_ / 2], [0, 0, 1]])

    warp = lambda a: cv2.warpPerspective(a, Hsp, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    img_sp = warp(sprite)
    a_phone = warp(phone_mask)[..., None]
    a_screen = warp(screen_mask)[..., None]

    bg = background(rng) / 255
    img = bg * (1 - a_phone) + img_sp * a_phone
    # soft contact shadow under the phone
    sh_k = cv2.GaussianBlur(a_phone[..., 0], (0, 0), 40)
    img = img * (1 - 0.18 * sh_k[..., None] * (1 - a_phone))

    # Glass: haze, glare blob(s) and sometimes a window-reflection band.
    haze = rng.uniform(*L["haze"])
    img = img + a_screen * haze * (1 - img)
    ga = rng.uniform(*L["glare"])
    if ga > 0.02:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        for _ in range(rng.integers(1, 3)):
            cx, cy = rng.uniform(0.1, 0.9) * W, rng.uniform(0.1, 0.9) * H
            sx, sy = rng.uniform(0.10, 0.35) * W, rng.uniform(0.08, 0.30) * H
            th = rng.uniform(0, math.pi)
            c, s = math.cos(th), math.sin(th)
            u, v = (xx - cx) * c + (yy - cy) * s, -(xx - cx) * s + (yy - cy) * c
            g = np.exp(-(u * u / (2 * sx * sx) + v * v / (2 * sy * sy)))
            img = img + (a_screen * (ga * g)[..., None]) * (1 - img)
        if rng.random() < 0.4 * (ga / 0.3):
            ang = rng.uniform(0, math.pi)
            c, s = math.cos(ang), math.sin(ang)
            pos = (xx * c + yy * s) / max(W, H)
            band = np.exp(-((pos - rng.uniform(0.2, 0.8)) ** 2) / (2 * 0.035 ** 2))
            img = img + (a_screen * (0.5 * ga * band)[..., None]) * (1 - img)

    # Moire from the display's pixel grid beating with the sensor's.
    ma = rng.uniform(*L["moire"])
    if ma > 0.004:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        p = rng.uniform(2.6, 5.2)
        phi = rng.uniform(0, math.pi)
        c, s = math.cos(phi), math.sin(phi)
        coord = (xx * c + yy * s) / p * 2 * math.pi
        m = np.stack([np.cos(coord + o) for o in (0.0, 2.1, 4.2)], axis=-1)  # RGB stripe phases
        coarse = 1 + 0.5 * np.cos((xx * 0.0013 + yy * 0.0021) * 2 * math.pi)
        img = img * (1 + (ma * m * coarse[..., None]) * a_screen)

    # Defocus plus a little hand shake.
    bl = rng.uniform(*L["blur"])
    img = cv2.GaussianBlur(img, (0, 0), bl)
    if L["motion"]:
        n = int(rng.integers(0, L["motion"] + 1))
        if n >= 3:
            ker = np.zeros((n, n), np.float32)
            ker[n // 2, :] = 1
            M = cv2.getRotationMatrix2D((n / 2 - 0.5, n / 2 - 0.5), rng.uniform(0, 180), 1)
            ker = cv2.warpAffine(ker, M, (n, n))
            ker /= ker.sum()
            img = cv2.filter2D(img, -1, ker)

    # Vignette, sensor noise, white balance drift.
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r2 = ((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2
    img = img * (1 - rng.uniform(0.0, 0.25) * r2[..., None] / 2)
    img = img * np.array([1 + rng.uniform(-0.04, 0.04) for _ in range(3)])[None, None, :]
    nz = rng.uniform(*L["noise"]) / 255
    img = img + rng.normal(0, nz, img.shape).astype(np.float32) * (0.4 + img)
    img = np.clip(img, 0, 1)

    # Fixture px -> photo px: fixture -> screen px -> sprite px (bezel) -> photo.
    A = np.array([[k, 0, bez], [0, k, bez], [0, 0, 1]])
    Hfix = Hsp @ A
    return (img * 255 + 0.5).astype(np.uint8), Hfix, dict(close=bool(close), rx=math.degrees(rx), ry=math.degrees(ry),
                                                              rz=math.degrees(rz), blur=bl, glare=ga, moire=ma, haze=haze)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "photos").mkdir(exist_ok=True)
    (OUT / "small").mkdir(exist_ok=True)
    fixtures = [f for f in json.load(open(FIX / "index.json")) if f["exact"]]
    manifest = []
    for fi, f in enumerate(fixtures):
        src = cv2.imread(str(FIX / f["file"]), cv2.IMREAD_COLOR)
        for li, (lname, L) in enumerate(LEVELS.items()):
            for k in range(PER_LEVEL):
                rng = np.random.default_rng(1000 * fi + 100 * li + k)
                img, Hfix, meta = render(src, rng, L)
                pid = f"{f['file'][:-4]}-{lname}-{k}"
                cv2.imwrite(str(OUT / "photos" / f"{pid}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, int(rng.integers(80, 93))])
                # What the app does today: resize to 720 wide, keep everything in frame.
                small = cv2.resize(img, (720, round(H * 720 / W)), interpolation=cv2.INTER_AREA)
                cv2.imwrite(str(OUT / "small" / f"{pid}.png"), small)
                manifest.append(dict(id=pid, fixture=f["file"], level=lname, today=f["today"], months=f["months"],
                                     periods=f["periods"], weekStart=f["weekStart"], size=[W, H],
                                     H=Hfix.tolist(), meta=meta))
    json.dump(manifest, open(OUT / "manifest.json", "w"), indent=1)
    print(len(manifest), "photos")


main()
