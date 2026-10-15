from pathlib import Path
import math, re, ast, xml.etree.ElementTree as E
REPO=Path(__file__).resolve().parent.parent
P=REPO/'assets/scalebot'
P.mkdir(exist_ok=True)
source=ast.parse((REPO/'scripts/build-pairing-rive.py').read_text())
fn=next(n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='vertices')
exec(compile(ast.Module(body=[fn],type_ignores=[]),'vertices','exec'))
body=next(ast.literal_eval(n.value) for n in source.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='body' for t in n.targets))
root=E.Element('Rive',version='1',kind='fragment')
board=E.SubElement(root,'Artboard',width='390',height='720',name='Scalebot · Connection',id='0:2',styleId='0:5',defaultStateMachineId='0:7')
E.SubElement(board,'LayoutComponentStyle',id='0:5')
uid=20

def node(parent,tag,**a):
 global uid
 uid+=1
 return E.SubElement(parent,tag,{'id':f'0:{uid}',**{k:str(v) for k,v in a.items()}})
def smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
def key(anim,obj,prop,vals,color=False):
 ko=E.SubElement(anim,'KeyedObject',objectId=obj.attrib['id']);kp=E.SubElement(ko,'KeyedProperty',property=prop)
 for f,v in vals:
  E.SubElement(kp,'KeyFrameColor' if color else 'KeyFrameDouble',frame=str(round(116+(f-116)*.4) if anim is pair and f>116 else f),value=str(v),interpolationType='linear')
def anim(name,duration,loop='oneShot'):
 return node(board,'LinearAnimation',name=name,duration=duration,fps=60,loopValue=loop)
pair=anim('Pairing',171)
frames=list(range(0,253,3))

def sample(path,n=96):
 vs=vertices(path); raw=[]
 for i,v in enumerate(vs):
  w=vs[(i+1)%len(vs)]
  for j in range(32):
   t=j/32;raw.append(tuple((1-t)**3*v['p'][k]+3*(1-t)**2*t*v['out'][k]+3*(1-t)*t*t*w['in'][k]+t**3*w['p'][k] for k in range(2)))
 raw.append(raw[0]);dist=[0]
 for a,b in zip(raw,raw[1:]):dist.append(dist[-1]+math.dist(a,b))
 out=[];j=0
 for i in range(n):
  d=dist[-1]*i/n
  while dist[j+1]<d:j+=1
  t=(d-dist[j])/(dist[j+1]-dist[j]);out.append(tuple(raw[j][k]*(1-t)+raw[j+1][k]*t for k in range(2)))
 return out

def capsule(l,t,w,h):
 r=h/2;k=r*.55228475;b=t+h;right=l+w;cy=t+r
 return f'M{l+r} {t} L{right-r} {t} C{right-r+k} {t} {right} {cy-k} {right} {cy} C{right} {cy+k} {right-r+k} {b} {right-r} {b} L{l+r} {b} C{l+r-k} {b} {l} {cy+k} {l} {cy} C{l} {cy-k} {l+r-k} {t} {l+r} {t} Z'

def destination(p,kind):
 x,y=p
 if kind=='panel':return 34+(x-340)/476*13.75,40+3.75+(y-398.5)/119*6.25
 # Match a 20 × 20 rounded-square silhouette.
 a=math.atan2((y-260)/220,(x-340)/317)
 cs,sn=math.cos(a),math.sin(a)
 return 34+10*math.copysign(abs(cs)**.66,cs),40+10*math.copysign(abs(sn)**.66,sn)

def position(p,f,kind='body',rim=False):
 pitch=(1-smooth((f-15)/85))*math.pi/4
 x=195+(p[0]-340)*.49;y=399+(p[1]-260)*.49*math.cos(pitch)+(5*math.sin(pitch) if rim else 0)
 progress=max(0,min(1,(f-116)/112));depth=max(0,min(1,(p[1]-42)/440));delay=depth*.5
 t=smooth((progress-delay)/(.74+.26*depth-delay))
 tx,ty=destination(p,kind)
 return x+(tx-x)*t,y+(ty-y)*t

def path_shape(name,points,kind='body',rim=False):
 sh=node(board,'Shape',name=name);pa=node(sh,'PointsPath',isClosed='true',isClockwise='true')
 for p in points:
  xy=position(p,0,kind,rim);v=node(pa,'StraightVertex',x=xy[0],y=xy[1])
  for k,axis in enumerate(['x','y']):key(pair,v,axis,[(f,position(p,f,kind,rim)[k]) for f in frames])
 return sh
# Front to back painter order: LEDs and face, then shell.
eyes=[]
for sx,tx in [(123.42,31.33),(556.58,36.665)]:
 sh=node(board,'Shape',name='Status LED',x=0,y=0)
 el=node(sh,'Ellipse',width=5,height=5);paint=node(sh,'Fill');col=node(paint,'SolidColor',colorValue='FF42463D')
 for k,axis in enumerate(['x','y']):
  vals=[]
  for f in frames:
   pos=position((sx,398.5),f,'panel');progress=smooth((f-116)/112)
   # exact logo placement at endpoint
   target=(tx,43.875)[k];end=destination((sx,398.5),'panel')[k]
   vals.append((f,pos[k]+(target-end)*progress))
  key(pair,sh,axis,vals)
 key(pair,el,'width',[(0,4),(110,4),(228,1.335)])
 key(pair,el,'height',[(0,2.83),(100,4),(110,4),(228,1.335)])
 key(pair,col,'colorValue',[(0,'FF42463D'),(134,'FF42463D'),(204,'FFFFFFFF')],True)
 eyes.append(col)
panel=path_shape('Face · screen outline',sample(capsule(102,339,476,119),72),'panel')
st=node(panel,'Stroke',thickness=1.15,cap='round',join='round');panelcol=node(st,'SolidColor',colorValue='FF42463D')
key(pair,st,'thickness',[(0,1.15),(125,1.15),(228,1.25)])
key(pair,panelcol,'colorValue',[(0,'FF42463D'),(134,'FF42463D'),(204,'FFFFFFFF')],True)
# Rainbow paint uses shell path itself, so nothing spills outside the icon.
shell=path_shape('Scalebot shell',sample(body,128))
shine=node(shell,'Fill');grad=node(shine,'LinearGradient',startX=1,startY=40,endX=26,endY=40,opacity=0)
for p,c in [(0,'00718563'),(.17,'99F8C67D'),(.32,'BBF2B4D6'),(.48,'CC9DADFF'),(.63,'CCA0E4F1'),(.78,'BBE7F4A1'),(1,'00718563')]:node(grad,'GradientStop',position=p,colorValue=c)
key(pair,grad,'opacity',[(0,0),(252,0)])
fill=node(shell,'Fill');shellcol=node(fill,'SolidColor',colorValue='00718563')
shell.remove(fill);shell.insert(list(shell).index(shine),fill)
key(pair,shellcol,'colorValue',[(0,'00718563'),(125,'00718563'),(180,'00718563'),(200,'55718563'),(228,'FF718563'),(252,'FF718563')],True)
stroke=node(shell,'Stroke',thickness=1.15,cap='round',join='round');outcol=node(stroke,'SolidColor',colorValue='CC42463D')
key(pair,outcol,'colorValue',[(0,'CC42463D'),(140,'CC42463D'),(220,'00718563')],True)
rim=path_shape('Lower shell edge',sample(body,128),rim=True)
st=node(rim,'Stroke',thickness=1);node(st,'SolidColor',colorValue='5542463D')
key(pair,rim,'opacity',[(0,.7),(100,0),(252,0)])
# Each status first applies the settled pairing pose. Status animations own paint only.
for name,duration in [('Disconnected',60),('Connected',60),('Connecting',90),('Syncing',54)]:
 a=anim(name,duration,'loop')
 colors=[(0,'FF353535'),(45,'FF718563'),(90,'FF353535')] if name=='Connecting' else [(0,'FF353535' if name=='Disconnected' else 'FF718563'),(duration,'FF353535' if name=='Disconnected' else 'FF718563')]
 key(a,shellcol,'colorValue',colors,True)
 key(a,grad,'opacity',[(0,1 if name=='Syncing' else 0),(duration,1 if name=='Syncing' else 0)])
 if name=='Syncing':
  key(a,grad,'startX',[(0,-2.5),(54,46.5)]);key(a,grad,'endX',[(0,21.5),(54,70.5)])
sm=E.SubElement(board,'StateMachine',name='Pairing',id='0:7');ly=node(sm,'StateMachineLayer',name='Pairing')
node(ly,'AnyState');node(ly,'ExitState');en=node(ly,'EntryState');state=node(ly,'AnimationState',animationId=pair.attrib['id']);E.SubElement(en,'StateTransition',stateToId=state.attrib['id'])
E.indent(root);(P/'scene.rml').write_text(E.tostring(root,encoding='unicode')+'\n');(P/'rive.yaml').write_text('name: kcalack-scalebot-status\n')
print('Wrote',P/'scene.rml')
