"""Author the monochrome pairing Rive from the existing chassis curves.

Run python3 scripts/build-pairing-rive.py, then rive assets/pairing --once.
The native app embeds the compiled .riv; rebuilding needs the official Rive CLI.
"""
from pathlib import Path
import math
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
frame_times = [0, 12, *range(18, 91, 6), 120]
animation = ET.Element('LinearAnimation', {'duration': '120', 'fps': '60', 'loopValue': 'oneShot', 'name': 'Pairing', 'id': '0:6'})
next_id = 20

def ident():
    global next_id
    next_id += 1
    return f'0:{next_id}'

def pose(frame):
    t = min(1, max(0, (frame - 12) / 78))
    return 1 - (1 - t) ** 3

def project(point, frame, z=0):
    t = pose(frame)
    angle, turn = t * math.pi / 4, t * -.075
    x, y = point[0] - 340, point[1] - 260
    x, y = x * math.cos(turn) - y * math.sin(turn), x * math.sin(turn) + y * math.cos(turn)
    factor = 900 / (900 - y * math.sin(angle) - z * t * math.cos(angle))
    return 340 + x * factor, 260 + (y * math.cos(angle) - z * t * math.sin(angle)) * factor

def keys(node, values):
    obj = ET.SubElement(animation, 'KeyedObject', {'objectId': node.attrib['id']})
    for prop, frames in values.items():
        p = ET.SubElement(obj, 'KeyedProperty', {'property': prop})
        for frame, value in zip(frame_times, frames):
            ET.SubElement(p, 'KeyFrameDouble', {'frame': str(frame), 'value': f'{value:.6f}', 'interpolationType': 'linear'})

def vertices(path):
    tokens = re.findall(r'[MLCZ]|-?\d+(?:\.\d+)?', path)
    result, i = [], 0
    while i < len(tokens):
        command = tokens[i]; i += 1
        if command == 'Z': break
        count = 6 if command == 'C' else 2
        coords = [float(v) for v in tokens[i:i+count]]; i += count
        end = tuple(coords[-2:])
        if command == 'M': result.append({'p': end, 'in': end, 'out': end})
        else:
            result[-1]['out'] = tuple(coords[:2]) if command == 'C' else result[-1]['p']
            incoming = tuple(coords[2:4]) if command == 'C' else end
            if end == result[0]['p']: result[0]['in'] = incoming
            else: result.append({'p': end, 'in': incoming, 'out': end})
    return result

def shape(parent, name, path, z=0, gradient=False, fill=False):
    node = ET.SubElement(parent, 'Shape', {'name': name, 'id': ident()})
    p = ET.SubElement(node, 'PointsPath', {'isClosed': 'true', 'isClockwise': 'true', 'name': 'Outline'})
    for vertex in vertices(path):
        frames = []
        for frame in frame_times:
            point, incoming, outgoing = [project(vertex[k], frame, z) for k in ['p', 'in', 'out']]
            frames.append({'x': point[0], 'y': point[1],
                'inRotation': math.atan2(incoming[1]-point[1], incoming[0]-point[0]),
                'inDistance': math.dist(incoming, point),
                'outRotation': math.atan2(outgoing[1]-point[1], outgoing[0]-point[0]),
                'outDistance': math.dist(outgoing, point)})
        v = ET.SubElement(p, 'CubicDetachedVertex', {'id': ident(), **{k: f'{val:.6f}' for k,val in frames[0].items()}})
        keys(v, {k: [f[k] for f in frames] for k in frames[0]})
    paint = ET.SubElement(node, 'Fill' if fill else 'Stroke', {} if fill else {'thickness':'1.8', 'cap':'round','join':'round'})
    if gradient:
        g = ET.SubElement(paint, 'LinearGradient', {'startX':'0','startY':'35','endX':'0','endY':'335'})
        for position,color in [('0','00353831'),('.23','1F353831'),('.62','B3353831'),('1','FF353831')]:
            ET.SubElement(g, 'GradientStop', {'position':position, 'colorValue':color})
    else: ET.SubElement(paint, 'SolidColor', {'colorValue':'FF353831' if not fill else '12353831'})
    return node

root=ET.Element('Rive',{'version':'1','kind':'fragment'})
board=ET.SubElement(root,'Artboard',{'width':'800','height':'600','name':'KCALACK Pairing','id':'0:2','defaultStateMachineId':'0:7','styleId':'0:5'})
ET.SubElement(board,'LayoutComponentStyle',{'id':'0:5','name':'Artboard Style'})
model=ET.SubElement(board,'Node',{'name':'Device','x':'60','y':'20'})
# Front panel and two LEDs; no decorative mouth. Shapes paint front-to-back.
panel='M168 384 C247 382 443 385 515 383 C560 381 585 397 583 422 C581 446 558 454 517 455 L169 454 C127 455 102 444 102 420 C101 397 126 385 168 384 Z'
shape(model,'Display window',panel)
for x in [180,503]:
    eye=ET.SubElement(model,'Shape',{'id':ident(),'name':'Indicator','x':str(x),'y':'419'})
    ET.SubElement(eye,'Ellipse',{'width':'8','height':'8'})
    stroke=ET.SubElement(eye,'Stroke',{'thickness':'1.8'})
    ET.SubElement(stroke,'SolidColor',{'colorValue':'FF353831'})
    points=[project((x,419),frame) for frame in frame_times]
    keys(eye,{'x':[p[0] for p in points],'y':[p[1] for p in points],'scaleY':[math.cos(pose(f)*math.pi/4) for f in frame_times]})
body='M26 420 C23 409 23 401 25 387 L48 132 C53 74 99 44 177 42 C250 39 442 42 511 43 C582 44 625 75 631 126 L655 391 C658 410 658 424 652 438 C631 467 601 476 555 479 C435 484 221 483 123 479 C67 477 35 460 26 420 Z'
shape(model,'Top outline',body,gradient=True)
lip=shape(model,'Lower rim',body,z=-15,gradient=True)
keys(lip,{'opacity':[pose(f)*.5 for f in frame_times]})
# Soft monochrome shadow gets wider as the viewing angle lowers.
shadow=ET.SubElement(model,'Shape',{'x':'340','y':'493','name':'Ground shadow','id':ident()})
ET.SubElement(shadow,'Ellipse',{'width':'580','height':'580'})
paint=ET.SubElement(shadow,'Fill');g=ET.SubElement(paint,'RadialGradient',{'startX':'0','startY':'0','endX':'290','endY':'0'})
for position,color in [('0','26353831'),('.55','12353831'),('1','00353831')]: ET.SubElement(g,'GradientStop',{'position':position,'colorValue':color})
keys(shadow,{'y':[493-54*pose(f) for f in frame_times],'scaleY':[.065+.025*pose(f) for f in frame_times],'opacity':[.25+.75*pose(f) for f in frame_times]})
machine=ET.SubElement(board,'StateMachine',{'name':'Pairing','id':'0:7'})
layer=ET.SubElement(machine,'StateMachineLayer',{'name':'Pairing layer','id':'0:8'})
ET.SubElement(layer,'AnyState',{'x':'0','y':'-100'});ET.SubElement(layer,'ExitState',{'x':'400','y':'-100'})
entry=ET.SubElement(layer,'EntryState');ET.SubElement(entry,'StateTransition',{'stateToId':'0:12'})
ET.SubElement(layer,'AnimationState',{'animationId':'0:6','id':'0:12','x':'200','y':'0'})
board.append(animation)
ET.indent(root)
destination=ROOT/'assets/pairing'
destination.mkdir(exist_ok=True)
(destination/'scene.rml').write_text(ET.tostring(root,encoding='unicode')+'\n')
(destination/'rive.yaml').write_text('name: kcalack-pairing\n')
