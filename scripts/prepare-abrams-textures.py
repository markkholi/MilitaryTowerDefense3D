"""Pack the supplied Abrams PBR maps for glTF without reducing resolution.

Called by prepare-abrams.mjs. Requires Pillow; no model-authoring dependencies.
"""
from pathlib import Path
import shutil
import sys
from PIL import Image, ImageOps

source = Path(sys.argv[1])
output = Path(sys.argv[2])
sets = [
    ('hull', 'Plane.364_baked', 'metallicRoughness_rough'),
    ('stowage', 'Material', 'metallicRoughness_rough'),
    ('tracks', 'Tracks_color.dds.001', 'metallicRoughness_rough_scale0'),
]
for name, original, rough_suffix in sets:
    # Preserve the artist's base-color JPEG bytes and full source resolution.
    shutil.copyfile(source / f'{original}_baseColor.jpg', output / f'{name}-basecolor.jpg')
    normal = Image.open(source / f'{original}_normal.jpg').convert('RGB')
    red, green, blue = normal.split()
    # Geometry flips V for glTF's image convention. Invert the normal's tangent
    # Y component to preserve the source surface orientation under that flip.
    Image.merge('RGB', (red, ImageOps.invert(green), blue)).save(output / f'{name}-normal.png', optimize=True)
    roughness = Image.open(source / f'{original}_{rough_suffix}.jpg').convert('L')
    metalness = Image.open(source / f'{original}_metallicRoughness_metal.jpg').convert('L')
    if roughness.size != metalness.size:
        raise ValueError(f'Mismatched PBR resolution in {name}')
    if name == 'tracks':
        # The supplied tread map is almost black (mean 6/255), producing a wet,
        # mirror-like track surface. Retain its variation in a dry-rubber range.
        roughness = roughness.point(lambda value: round(194 + value * .22))
    Image.merge('RGB', (Image.new('L', roughness.size, 255), roughness, metalness)).save(
        output / f'{name}-metallic-roughness.png', optimize=True)
shutil.copyfile(source / 'Turret_baseColor.jpg', output / 'turret-basecolor.jpg')
