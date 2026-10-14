"""Author four discrete meal landscapes. Rive interpolates only after a snap.
Run python3 scripts/build-meal-sky-rive.py && rive assets/meal-sky --once.
"""
from pathlib import Path
import xml.etree.ElementTree as E
ROOT=Path(__file__).resolve().parent.parent
root=E.Element('Rive',version='1',kind='fragment')
board=E.SubElement(root,'Artboard',width='500',height='500',name='Meal sky',id='0:2',styleId='0:5')
E.SubElement(board,'LayoutComponentStyle',id='0:5')
anim=E.Element('LinearAnimation',duration='240',fps='60',loopValue='oneShot',name='Daylight',id='0:6')
seq=20

def uid():
 global seq
 seq+=1
 return f'0:{seq}'

def keys(node,prop,values,color=False):
 obj=E.SubElement(anim,'KeyedObject',objectId=node.attrib['id'])
 p=E.SubElement(obj,'KeyedProperty',property=prop)
 for i,value in enumerate(values+[values[0]]):
  E.SubElement(p,'KeyFrameColor' if color else 'KeyFrameDouble',frame=str(i*60),value=str(value),interpolationType='linear')

def ellipse(parent,name,x,y,w,h):
 shape=E.SubElement(parent,'Shape',name=name,id=uid(),x=str(x),y=str(y))
 E.SubElement(shape,'Ellipse',width=str(w),height=str(h))
 return shape

def gradient(shape,top,bottom,y0=0,y1=500):
 g=E.SubElement(E.SubElement(shape,'Fill'),'LinearGradient',startX='0',startY=str(y0),endX='0',endY=str(y1))
 for pos,colors in [(0,top),(1,bottom)]:
  stop=E.SubElement(g,'GradientStop',id=uid(),position=str(pos),colorValue='FF'+colors[0])
  keys(stop,'colorValue',['FF'+c for c in colors],True)

# Camera is authored in the same artboard, so native canvas composition cannot
# cover it. The page keeps the accessible hit target and capture behavior.
camera=E.SubElement(board,'Node',name='Camera button',id=uid())
lens=ellipse(camera,'Camera lens',250,253,17,17)
E.SubElement(E.SubElement(lens,'Stroke',thickness='4.9'),'SolidColor',colorValue='FFFFFFFF')
outline=E.SubElement(camera,'Shape',name='Camera outline',id=uid())
p=E.SubElement(outline,'PointsPath',isClosed='true')
for x,y in [(228,236),(236,236),(241,228),(259,228),(264,236),(272,236),(275,240),(275,269),(272,272),(228,272),(225,269),(225,240)]:
 E.SubElement(p,'StraightVertex',x=str(x),y=str(y),radius='3')
E.SubElement(E.SubElement(outline,'Stroke',thickness='4.9',cap='round',join='round'),'SolidColor',colorValue='FFFFFFFF')
button=ellipse(camera,'Camera surface',250,250,152,152)
E.SubElement(E.SubElement(button,'Fill'),'SolidColor',colorValue='FF353535')
# Rive paints front-to-back. Clip every landscape layer to a common circle.
scene=E.SubElement(board,'Node',name='Landscape',id=uid())
mask=ellipse(board,'Circle clip',250,250,500,500)
E.SubElement(scene,'ClippingShape',sourceId=mask.attrib['id'])
fog=ellipse(scene,'Mist',250,320,700,180)
fog_paint=E.SubElement(E.SubElement(fog,'Fill'),'RadialGradient',startX='0',startY='0',endX='300',endY='0')
for position,color in [('0','B0DAF0E5'),('.55','50DAF0E5'),('1','00DAF0E5')]:
 E.SubElement(fog_paint,'GradientStop',position=position,colorValue=color)
keys(fog,'opacity',[0,0,0,.6])
# Two scaled copies of the same ellipse: identical arch proportions.
front=ellipse(scene,'Large hill',350,490,730,438)
gradient(front,['CFEE88','B5ED8A','D4DD83','ADD4C6'],['5FA991','45B79F','829A5C','396D91'],-219,50)
back=ellipse(scene,'Small hill',75,382,450,270)
gradient(back,['D5EF8C','BCEB81','DDD77B','8CC4BD'],['78AF70','63BA86','9C9C63','456C94'],-135,70)
sun=E.SubElement(scene,'Node',name='Sun',id=uid(),x='95',y='270')
keys(sun,'x',[95,250,405,405]);keys(sun,'y',[270,95,270,300]);keys(sun,'opacity',[1,1,1,0])
for size,alpha in [(78,'FF'),(108,'40'),(142,'20')]:
 shape=ellipse(sun,'Sun glow',0,0,size,size)
 E.SubElement(E.SubElement(shape,'Fill'),'SolidColor',colorValue=alpha+'FFFCE5')
sky=ellipse(scene,'Sky',250,250,500,500)
gradient(sky,['9DE6ED','8ADDEA','F589B1','3989AA'],['F5FFAF','C9F6EA','FFF4AB','D5E9DB'],-250,250)
board.set('defaultStateMachineId','0:7')
machine=E.SubElement(board,'StateMachine',name='Daylight',id='0:7')
layer=E.SubElement(machine,'StateMachineLayer',name='Sky',id='0:8')
E.SubElement(layer,'AnyState');E.SubElement(layer,'ExitState')
entry=E.SubElement(layer,'EntryState');E.SubElement(entry,'StateTransition',stateToId='0:12')
E.SubElement(layer,'AnimationState',animationId='0:6',id='0:12')
board.append(anim)
E.indent(root)
dest=ROOT/'assets/meal-sky';dest.mkdir(exist_ok=True)
(dest/'scene.rml').write_text(E.tostring(root,encoding='unicode')+'\n')
(dest/'rive.yaml').write_text('name: kcalack-meal-sky\n')

# Static fallback shares the native scene's geometry and colors.
skies=[('9de6ed','f5ffaf','d5ef8c','78af70','cfee88','5fa991',95,270),('8addea','c9f6ea','bceb81','63ba86','b5ed8a','45b79f',250,95),('f589b1','fff4ab','ddd77b','9c9c63','d4dd83','829a5c',405,270),('3989aa','d5e9db','8cc4bd','456c94','add4c6','396d91',405,300)]
for i,(a,b,c,d,e,f,x,y) in enumerate(skies):
 svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><defs><radialGradient id="fade"><stop offset=".67" stop-color="white"/><stop offset=".82" stop-color="white" stop-opacity=".85"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient><mask id="mask"><circle cx="250" cy="250" r="250" fill="url(#fade)"/></mask><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#{a}"/><stop offset="1" stop-color="#{b}"/></linearGradient><linearGradient id="back" x2="0" y2="1"><stop stop-color="#{c}"/><stop offset=".76" stop-color="#{d}"/></linearGradient><linearGradient id="front" x2="0" y2="1"><stop stop-color="#{e}"/><stop offset=".61" stop-color="#{f}"/></linearGradient></defs><g mask="url(#mask)"><path fill="url(#sky)" d="M0 0H500V500H0Z"/>'''
 if i!=3:
  for r,opacity in [(71,.125),(54,.25),(39,1)]:svg+=f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fffce5" opacity="{opacity}"/>'
 svg+='<ellipse cx="75" cy="382" rx="225" ry="135" fill="url(#back)"/><ellipse cx="350" cy="490" rx="365" ry="219" fill="url(#front)"/>'
 if i==3:svg+='<ellipse cx="250" cy="320" rx="350" ry="90" fill="#daf0e5" opacity=".25"/>'
 svg+='</g></svg>\n';(ROOT/f'miniprogram/assets/meals/sky-{i}.svg').write_text(svg)
