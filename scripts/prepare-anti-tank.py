"""Convert the user-supplied anti-tank-turret.zip to an articulated glTF.

Usage: python scripts/prepare-anti-tank.py path/to/anti-tank-turret.zip
Requires NumPy and Pillow. Reads the original ZIP without changing it. The DAE
contains the authored normals/tangents and geometry; its sibling JPEG maps
provide the complete PBR material bindings omitted by the DAE's Phong effects.
"""
from io import BytesIO
from pathlib import Path
import hashlib
import json
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile

import numpy as np
from PIL import Image, ImageOps


source = Path(sys.argv[1])
source_bytes = source.read_bytes()
output = Path('public/assets/anti-tank')
output.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(BytesIO(source_bytes)) as outer:
    nested_bytes = outer.read('source/model.zip')
with zipfile.ZipFile(BytesIO(nested_bytes)) as archive:
    dae = archive.read('model/model.dae')
    # Read only expected texture paths; archive filenames never become paths.
    textures = {f'{part}_{kind}': archive.read(f'model/textures/{part}_{kind}.jpg')
                for part in ('Body', 'Dome', 'Barrel')
                for kind in ('albedo', 'normal', 'AO', 'roughness', 'metallic')}

ns = {'c': 'http://www.collada.org/2005/11/COLLADASchema'}
xml = ET.fromstring(dae)
if xml.find('c:asset/c:up_axis', ns).text != 'Y_UP':
    raise ValueError('Expected the source Y-up coordinate system.')
if float(xml.find('c:asset/c:unit', ns).get('meter')) != 1:
    raise ValueError('Unexpected source unit scale.')
nodes = xml.findall('c:library_visual_scenes/c:visual_scene/c:node', ns)
expected_nodes = ['Body_Panel_low', 'Barrel_low', 'Dome_low', 'Body_low']
if [node.get('name') for node in nodes] != expected_nodes:
    raise ValueError('The expected four source mesh nodes have changed.')
for node in nodes:
    matrix = np.fromstring(node.find('c:matrix', ns).text, sep=' ').reshape(4, 4)
    if not np.allclose(matrix, np.eye(4)):
        raise ValueError('Source transforms must be baked before conversion.')

meshes = []
for geometry in xml.findall('c:library_geometries/c:geometry', ns):
    element = geometry.find('c:mesh', ns)
    sources = {}
    for item in element.findall('c:source', ns):
        accessor = item.find('c:technique_common/c:accessor', ns)
        count, stride = int(accessor.get('count')), int(accessor.get('stride'))
        values = np.fromstring(item.find('c:float_array', ns).text, sep=' ')
        if len(values) != count * stride:
            raise ValueError('Unexpected DAE accessor size.')
        sources[item.get('id')] = values.reshape(count, stride)
    attributes = {item.get('semantic'): sources[item.get('source')[1:]]
                  for item in element.findall('c:vertices/c:input', ns)}
    polylist = element.find('c:polylist', ns)
    if len(polylist.findall('c:input', ns)) != 1:
        raise ValueError('Expected shared DAE attribute indices.')
    sizes = np.fromstring(polylist.find('c:vcount', ns).text, sep=' ', dtype=np.uint16)
    if not np.all(sizes == 3):
        raise ValueError('Expected the source triangles; no retriangulation is applied.')
    indices = np.fromstring(polylist.find('c:p', ns).text, sep=' ', dtype=np.uint16)
    if len(indices) != len(sizes) * 3:
        raise ValueError('Invalid source triangle list.')
    meshes.append({'id': geometry.get('id'), 'attributes': attributes, 'indices': indices})
if [len(mesh['indices']) // 3 for mesh in meshes] != [10, 1660, 706, 494]:
    raise ValueError('Source triangle counts changed.')

# The source is already +X forward. Its collar ring is centered at X=-.339962,
# while its total bounds are offset by the gun overhang. Center placement on
# that physical rotation axis and leave the stabilizer feet on ground Y=0.
source_pivot = np.array([-.33996165, .255239, 0.0])
source_muzzle = np.array([1.0, .354965, -.00000032])
source_min = np.min(np.concatenate([m['attributes']['POSITION'] for m in meshes]), axis=0)
source_max = np.max(np.concatenate([m['attributes']['POSITION'] for m in meshes]), axis=0)
normalized_length = 60
scale = normalized_length / (source_max[0] - source_min[0])
origin = np.array([source_pivot[0], source_min[1], 0.0])
pivot = (source_pivot - origin) * scale
muzzle = (source_muzzle - source_pivot) * scale
fallback_tangents = 0


def normalize(vectors):
    lengths = np.linalg.norm(vectors, axis=1)
    if np.any(lengths < 1e-10):
        raise ValueError('Cannot normalize a zero vector.')
    return vectors / lengths[:, None]


def convert_attributes(mesh, upper):
    global fallback_tangents
    attributes = mesh['attributes']
    positions = (attributes['POSITION'] - origin) * scale
    if upper:
        positions -= pivot
    normals = normalize(attributes['NORMAL'])
    uv = attributes['TEXCOORD'].copy()
    # DAE has bottom-origin V. glTF images have top-origin V. Tangent handedness
    # and the normal map's Y component are both changed with this UV conversion.
    uv[:, 1] = 1 - uv[:, 1]
    tangent = attributes['TANGENT'].copy()
    tangent -= normals * np.sum(normals * tangent, axis=1)[:, None]
    missing = np.linalg.norm(tangent, axis=1) < 1e-8
    fallback_tangents += int(missing.sum())
    for i in np.flatnonzero(missing):
        # A few vertices on the base underside have no authored tangent. A
        # stable perpendicular basis avoids NaNs without altering their normals.
        axis = np.eye(3)[np.argmin(np.abs(normals[i]))]
        tangent[i] = np.cross(axis, normals[i])
    tangent = normalize(tangent)
    handedness = np.sign(np.sum(np.cross(normals, tangent) * attributes['BINORMAL'], axis=1))
    handedness[handedness == 0] = 1
    return {'POSITION': positions, 'NORMAL': normals,
            'TANGENT': np.column_stack((tangent, -handedness)), 'TEXCOORD_0': uv}


converted = [convert_attributes(mesh, i in (1, 2)) for i, mesh in enumerate(meshes)]
# Batch the small body control panel with the fixed base; retain the separate
# dome and barrel parts so yaw and recoil never distort the stationary legs.
groups = [
    ('chassis', 'Body', [0, 3]),
    ('turret', 'Dome', [2]),
    ('recoil', 'Barrel', [1]),
]
gltf = {
    'asset': {'version': '2.0', 'generator': 'MTD3D anti-tank DAE preparation'},
    'scene': 0, 'scenes': [{'nodes': [0]}],
    'nodes': [
        {'name': 'AntiTankTurret', 'children': [1], 'extras': {
            'source': source.name, 'sourceSha256': hashlib.sha256(source_bytes).hexdigest(),
            'triangles': 2870, 'normalizedLength': normalized_length,
            'sourceAuthoringTool': 'Assimp Exporter',
        }},
        {'name': 'heading', 'children': [2, 3]},
        {'name': 'chassis', 'children': []},
        {'name': 'turret', 'translation': pivot.tolist(), 'children': [4]},
        {'name': 'recoil', 'children': [5]},
        {'name': 'muzzle', 'translation': muzzle.tolist()},
    ],
    'meshes': [], 'accessors': [], 'bufferViews': [], 'buffers': [],
    'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
    'images': [], 'textures': [], 'materials': [],
}


def texture(filename):
    gltf['images'].append({'uri': filename})
    gltf['textures'].append({'source': len(gltf['images']) - 1, 'sampler': 0})
    return len(gltf['textures']) - 1


for part in ('Body', 'Dome', 'Barrel'):
    name = part.lower()
    (output / f'{name}-basecolor.jpg').write_bytes(textures[f'{part}_albedo'])
    normal = Image.open(BytesIO(textures[f'{part}_normal'])).convert('RGB')
    red, green, blue = normal.split()
    Image.merge('RGB', (red, ImageOps.invert(green), blue)).save(output / f'{name}-normal.png', optimize=True)
    maps = [Image.open(BytesIO(textures[f'{part}_{kind}'])).convert('L')
            for kind in ('AO', 'roughness', 'metallic')]
    if any(image.size != (2048, 2048) for image in [normal, *maps]):
        raise ValueError('Expected original 2K texture resolution.')
    # glTF packs occlusion/roughness/metallic into R/G/B. Keep every decoded
    # source value; no painted color, gloss or metal map is synthesized.
    Image.merge('RGB', tuple(maps)).save(output / f'{name}-orm.png', optimize=True)
    base_texture = texture(f'{name}-basecolor.jpg')
    normal_texture = texture(f'{name}-normal.png')
    orm_texture = texture(f'{name}-orm.png')
    gltf['materials'].append({
        'name': f'Weathered {name}',
        'pbrMetallicRoughness': {
            'baseColorTexture': {'index': base_texture},
            'metallicRoughnessTexture': {'index': orm_texture},
            'metallicFactor': 1, 'roughnessFactor': 1,
        },
        'normalTexture': {'index': normal_texture, 'scale': 1},
        'occlusionTexture': {'index': orm_texture, 'texCoord': 0, 'strength': 1},
    })

binary = bytearray()


def accessor(array, index=False):
    array = np.asarray(array, dtype='<u2' if index else '<f4')
    offset = len(binary)
    raw = array.tobytes()
    binary.extend(raw)
    binary.extend(b'\x00' * (-len(binary) % 4))
    gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(raw),
                                'target': 34963 if index else 34962})
    dimensions = 1 if index else array.shape[1]
    minima = [int(array.min())] if index else array.min(axis=0).tolist()
    maxima = [int(array.max())] if index else array.max(axis=0).tolist()
    gltf['accessors'].append({
        'bufferView': len(gltf['bufferViews']) - 1, 'componentType': 5123 if index else 5126,
        'count': len(array), 'type': {1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4'}[dimensions],
        'min': minima, 'max': maxima,
    })
    return len(gltf['accessors']) - 1


vertices = 0
for material, (section, part, members) in enumerate(groups):
    attributes = {semantic: accessor(np.concatenate([converted[i][semantic] for i in members]))
                  for semantic in ('POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0')}
    offset = 0
    indices = []
    for i in members:
        indices.extend(meshes[i]['indices'].astype(np.uint32) + offset)
        offset += len(converted[i]['POSITION'])
    if offset > 65535:
        raise ValueError('Batch exceeds Uint16 index capacity.')
    vertices += offset
    gltf['meshes'].append({'name': f'{section}-{part}', 'primitives': [{
        'attributes': attributes, 'indices': accessor(indices, True), 'material': material,
    }]})
    node = len(gltf['nodes'])
    gltf['nodes'].append({'name': f'{section}-{part}', 'mesh': len(gltf['meshes']) - 1})
    gltf['nodes'][{'chassis': 2, 'turret': 3, 'recoil': 4}[section]]['children'].append(node)
gltf['buffers'].append({'byteLength': len(binary)})
encoded_json = json.dumps(gltf, separators=(',', ':')).encode()
encoded_json += b' ' * (-len(encoded_json) % 4)
glb = (struct.pack('<III', 0x46546C67, 2, 28 + len(encoded_json) + len(binary))
       + struct.pack('<II', len(encoded_json), 0x4E4F534A) + encoded_json
       + struct.pack('<II', len(binary), 0x004E4942) + binary)
(output / 'anti-tank-turret.glb').write_bytes(glb)
print(json.dumps({
    'triangles': 2870, 'vertices': vertices, 'drawCalls': 3,
    'glbBytes': len(glb), 'geometryBytes': len(binary),
    'bounds': ((source_max - source_min) * scale).tolist(),
    'pivot': pivot.tolist(), 'muzzle': muzzle.tolist(), 'muzzleWorld': (muzzle + pivot).tolist(),
    'recoilTriangles': 1660, 'fallbackTangents': fallback_tangents,
    'sourceSha256': hashlib.sha256(source_bytes).hexdigest(),
}, indent=2))
