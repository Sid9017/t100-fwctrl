"""Author the monochrome pairing Rive from the existing chassis curves.

Run python3 scripts/build-pairing-rive.py, then rive assets/pairing --once.
The native app embeds the compiled .riv; rebuilding needs the official Rive CLI.
"""
from pathlib import Path
import math
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
frame_times = list(range(0, 163, 6))
animation = ET.Element('LinearAnimation', {'duration': '162', 'fps': '60', 'loopValue': 'oneShot', 'name': 'Pairing', 'id': '0:6'})
next_id = 20

def ident():
    global next_id
    next_id += 1
    return f'0:{next_id}'

def pose(frame):
    t = min(1, max(0, (frame - 12) / 78))
    return (1 - t) ** 3

def zoom(frame):
    t = min(1, max(0, (frame - 90) / 60))
    return 1 + .06 * (t * t * (3 - 2 * t))

def project(point, frame, z=0):
    # Pitch only: both sides stay level on the same horizontal surface.
    t = pose(frame)
    angle = t * math.pi / 4
    return (340 + (point[0] - 340) * zoom(frame),
            260 + ((point[1] - 260) * math.cos(angle) - z * t * math.sin(angle)) * zoom(frame))

def display_project(point, frame, z=0):
    # The display is embedded in the chassis plane, not a camera-facing billboard.
    # Shared projection keeps its lower edge inside the rim throughout the pitch.
    return project(point, frame, z)

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

def shape(parent, name, path, z=0, gradient=False, fill=False, projector=project):
    node = ET.SubElement(parent, 'Shape', {'name': name, 'id': ident()})
    p = ET.SubElement(node, 'PointsPath', {'isClosed': 'true', 'isClockwise': 'true', 'name': 'Outline'})
    for vertex in vertices(path):
        frames = []
        for frame in frame_times:
            point, incoming, outgoing = [projector(vertex[k], frame, z) for k in ['p', 'in', 'out']]
            frames.append({'x': point[0], 'y': point[1],
                'inRotation': math.atan2(incoming[1]-point[1], incoming[0]-point[0]),
                'inDistance': math.dist(incoming, point),
                'outRotation': math.atan2(outgoing[1]-point[1], outgoing[0]-point[0]),
                'outDistance': math.dist(outgoing, point)})
        v = ET.SubElement(p, 'CubicDetachedVertex', {'id': ident(), **{k: f'{val:.6f}' for k,val in frames[0].items()}})
        keys(v, {k: [f[k] for f in frames] for k in frames[0]})
    paint = ET.SubElement(node, 'Fill' if fill else 'Stroke', {} if fill else {'thickness':'1.8', 'cap':'round','join':'round'})
    if gradient:
        g = ET.SubElement(paint, 'LinearGradient', {'id':ident(),'startX':'0','startY':'35','endX':'0','endY':'335'})
        keys(g, {'startY':[project((340,35),f,z)[1] for f in frame_times], 'endY':[project((340,335),f,z)[1] for f in frame_times]})
        for position,color in [('0','00353831'),('.23','1F353831'),('.62','B3353831'),('1','FF353831')]:
            ET.SubElement(g, 'GradientStop', {'position':position, 'colorValue':color})
    else: ET.SubElement(paint, 'SolidColor', {'colorValue':'FF353831' if not fill else '12353831'})
    return node

root=ET.Element('Rive',{'version':'1','kind':'fragment'})
board=ET.SubElement(root,'Artboard',{'width':'680','height':'520','name':'KCALACK Pairing','id':'0:2','defaultStateMachineId':'0:7','styleId':'0:5'})
ET.SubElement(board,'LayoutComponentStyle',{'id':'0:5','name':'Artboard Style'})
model=ET.SubElement(board,'Node',{'name':'Device','x':'0','y':'0'})
# Front panel and two LEDs; no decorative mouth. Shapes paint front-to-back.
# Match device-preview's 4:1 black capsule and 80% inset 320×80 canvas.
DISPLAY_WIDTH = 476
DISPLAY_HEIGHT = DISPLAY_WIDTH * 80 / 320
DISPLAY_LEFT, DISPLAY_TOP = 102, 339
radius = DISPLAY_HEIGHT / 2
handle = radius * 0.5522847498307936
l, r = DISPLAY_LEFT, DISPLAY_LEFT + DISPLAY_WIDTH
t, b = DISPLAY_TOP, DISPLAY_TOP + DISPLAY_HEIGHT
cy = t + radius
panel=(f'M{l+radius} {t} L{r-radius} {t} '
       f'C{r-radius+handle} {t} {r} {cy-handle} {r} {cy} '
       f'C{r} {cy+handle} {r-radius+handle} {b} {r-radius} {b} '
       f'L{l+radius} {b} C{l+radius-handle} {b} {l} {cy+handle} {l} {cy} '
       f'C{l} {cy-handle} {l+radius-handle} {t} {l+radius} {t} Z')
shape(model,'Display window',panel,projector=display_project)
for x in [DISPLAY_LEFT+DISPLAY_WIDTH*.045, DISPLAY_LEFT+DISPLAY_WIDTH*.955]:
    initial=display_project((x,cy),0)
    eye=ET.SubElement(model,'Shape',{'id':ident(),'name':'Indicator','x':str(initial[0]),'y':str(initial[1]),'scaleX':str(zoom(0)),'scaleY':str(zoom(0)*math.cos(pose(0)*math.pi/4))})
    ET.SubElement(eye,'Ellipse',{'width':str(DISPLAY_WIDTH*.03),'height':str(DISPLAY_HEIGHT*.12)})
    stroke=ET.SubElement(eye,'Stroke',{'thickness':'1.8'})
    ET.SubElement(stroke,'SolidColor',{'colorValue':'FF353831'})
    points=[display_project((x,cy),frame) for frame in frame_times]
    keys(eye,{'x':[p[0] for p in points],'y':[p[1] for p in points],'scaleX':[zoom(f) for f in frame_times],'scaleY':[zoom(f)*math.cos(pose(f)*math.pi/4) for f in frame_times]})
body='M26 420 C23 409 23 401 25 387 L48 132 C53 74 99 44 177 42 C250 39 442 42 511 43 C582 44 625 75 631 126 L655 391 C658 410 658 424 652 438 C631 467 601 476 555 479 C435 484 221 483 123 479 C67 477 35 460 26 420 Z'
shape(model,'Top outline',body,gradient=True)
lip=shape(model,'Lower rim',body,z=-15,gradient=True)
keys(lip,{'opacity':[pose(f)*.5 for f in frame_times]})
# Soft monochrome shadow gets wider as the viewing angle lowers.
shadow=ET.SubElement(model,'Shape',{'x':'340','y':'493','name':'Ground shadow','id':ident()})
ET.SubElement(shadow,'Ellipse',{'width':'580','height':'580'})
paint=ET.SubElement(shadow,'Fill');g=ET.SubElement(paint,'RadialGradient',{'startX':'0','startY':'0','endX':'290','endY':'0'})
for position,color in [('0','26353831'),('.55','12353831'),('1','00353831')]: ET.SubElement(g,'GradientStop',{'position':position,'colorValue':color})
keys(shadow,{'y':[project((340,495),f)[1] for f in frame_times],'scaleX':[zoom(f) for f in frame_times],'scaleY':[.065+.025*pose(f) for f in frame_times],'opacity':[.25+.75*pose(f) for f in frame_times]})
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

# Static final pose uses exactly the same geometry as the last Rive frame.
# It also provides an offline fallback if the animation engine cannot start.
def svg_path(path, projector=project, z=0):
    tokens = re.findall(r'[MLCZ]|-?\d+(?:\.\d+)?', path)
    out, i = [], 0
    while i < len(tokens):
        command=tokens[i]; i+=1; out.append(command)
        if command=='Z': break
        count=6 if command=='C' else 2
        for offset in range(0,count,2):
            x,y=projector((float(tokens[i+offset]),float(tokens[i+offset+1])),162,z)
            out.append(f'{x:.4f} {y:.4f}')
        i+=count
    return ' '.join(out)
y0,y1=project((340,35),162)[1],project((340,335),162)[1]
# Preserve the same indicators while the final line art crossfades to WASM.
indicators=''.join(f'<ellipse cx="{display_project((x,cy),162)[0]}" cy="{display_project((x,cy),162)[1]}" rx="{DISPLAY_WIDTH*.015*zoom(162)}" ry="{DISPLAY_HEIGHT*.06*zoom(162)*math.cos(pose(162)*math.pi/4)}" stroke="#353831"/>' for x in [DISPLAY_LEFT+DISPLAY_WIDTH*.045,DISPLAY_LEFT+DISPLAY_WIDTH*.955])
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 520"><defs><linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="0" y1="{y0}" x2="0" y2="{y1}"><stop stop-color="#353831" stop-opacity="0"/><stop offset=".23" stop-color="#353831" stop-opacity=".12"/><stop offset=".62" stop-color="#353831" stop-opacity=".7"/><stop offset="1" stop-color="#353831"/></linearGradient><radialGradient id="shadow"><stop stop-color="#353831" stop-opacity=".15"/><stop offset=".55" stop-color="#353831" stop-opacity=".07"/><stop offset="1" stop-color="#353831" stop-opacity="0"/></radialGradient></defs><ellipse cx="340" cy="{project((340,495),162)[1]}" rx="{290*zoom(162)}" ry="{290*(.065+.025*pose(162))}" opacity="{.25+.75*pose(162)}" fill="url(#shadow)"/><g fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="{svg_path(body,z=-15)}" stroke="url(#fade)" opacity="{pose(162)*.5}"/><path d="{svg_path(body)}" stroke="url(#fade)"/><path d="{svg_path(panel,display_project)}" stroke="#353831"/>{indicators}</g></svg>'''
(ROOT/'miniprogram/pairing/assets/final.svg').write_text(svg+'\n')
left,_=display_project((102,339),162)
# The animation ends overhead: the live panel matches its native 4:1 ratio.
top=display_project((340,398.5),162)[1]-DISPLAY_HEIGHT*zoom(162)/2
import json
(ROOT/'miniprogram/pairing/assets/frame.js').write_text('module.exports='+json.dumps({'left':left/680*100,'top':top/520*100,'width':DISPLAY_WIDTH*zoom(162)/680*100,'height':DISPLAY_HEIGHT*zoom(162)/520*100})+';\n')
