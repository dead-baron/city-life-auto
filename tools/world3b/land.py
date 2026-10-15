# The 2 m class map (cls2m.npy, new frame / 2) -> the skeleton's land data: MAINLAND, ISLANDS, LAKES, STREAMS (rivers
# with widths), BIOMES polygons, CITY areas. Output: land.json (frame tiles), preview.
import numpy as np, json, cv2
from scipy import ndimage as nd
from skimage.morphology import skeletonize, disk
import networkx as nx
G=np.load('cls2m.npy'); H,W=G.shape   # 2 m per cell
SEA,MEADOW,FOREST,DESERT,MOUNT,MESA,CANYON,BEACH,CITY,FIELD,FOREST2=1,2,3,4,5,6,7,8,9,10,11
water=G==SEA
land=~water
# close narrow water (rivers < ~70 m) to find the coast without the rivers
# rivers: water narrower than ~56 m (not the opened water), long, outside the gulf's box; plus the lakes (holes)
Rw=14
wide=cv2.morphologyEx(water.astype(np.uint8),cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*Rw+1,2*Rw+1)))>0
narrow=water&~wide
gx0,gy0,gx1,gy1=2250//2,1940//2,4320//2,3420//2
narrow[gy0:gy1,gx0:gx1]=False
nl,nn=nd.label(narrow)
keepr=np.zeros_like(narrow)
for i,sl in enumerate(nd.find_objects(nl)):
    ext=max(sl[0].stop-sl[0].start, sl[1].stop-sl[1].start)*2
    if ext>=260: keepr[sl]|=(nl[sl]==i+1)
closed=land|keepr
closed=nd.binary_fill_holes(closed)
# in the gulf, break the thin land joins (piers, a pinch of the channel) so the city's islands stay islands
box=np.zeros_like(closed); box[gy0:gy1,gx0:gx1]=True
opened=cv2.morphologyEx(closed.astype(np.uint8),cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(15,15)))>0
closed=np.where(box,opened,closed)
# components
lab,n=nd.label(closed)
sizes=nd.sum(closed,lab,range(1,n+1))
order=np.argsort(-sizes)
def poly_of(mask, eps):
    cs,_=cv2.findContours(mask.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    c=max(cs,key=cv2.contourArea)
    a=cv2.approxPolyDP(c,eps,True)[:,0,:]
    return [[int(x*2),int(y*2)] for x,y in a]
out={'islands':[], 'lakes':[], 'streams':[], 'biomes':{}, 'city':[]}
main=lab==(order[0]+1)
out['mainland']=poly_of(main,2.0)
for k in order[1:]:
    s=sizes[k]*4
    if s<1500: continue
    m=lab==(k+1)
    ys,xs=np.nonzero(m)
    out['islands'].append({'area':int(s),'box':[int(xs.min()*2),int(ys.min()*2),int(xs.max()*2),int(ys.max()*2)],'poly':poly_of(m,1.5),
       'rock':bool((G[m]==MOUNT).mean()>0.5),'city':float((G[m]==CITY).mean())})
# inland water = water inside the closed land
inland=water&closed
ilab,ni=nd.label(inland)
isz=nd.sum(inland,ilab,range(1,ni+1))
dist=nd.distance_transform_edt(inland)
rivermask=np.zeros_like(inland)
for i,s in enumerate(isz):
    m=ilab==(i+1)
    if s*4<400: continue
    # a lake: compact (its widest point is wide compared with its size)
    md=dist[m].max()*2   # m
    ys,xs=np.nonzero(m)
    ext=max(xs.max()-xs.min(),ys.max()-ys.min())*2
    if md>=30 and ext<md*8:
        out['lakes'].append({'area':int(s*4),'poly':poly_of(m,1.5)})
    else:
        rivermask|=m
# rivers: skeleton with widths
sk=skeletonize(rivermask)
ys,xs=np.nonzero(sk)
S=set(zip(ys.tolist(),xs.tolist()))
Gr=nx.Graph()
for (y,x) in S:
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            if (dy or dx) and (y+dy,x+dx) in S: Gr.add_edge((y,x),(y+dy,x+dx))
junc=set(nn for nn in Gr.nodes if Gr.degree(nn)!=2)
seen=set(); chains=[]
for s in junc:
    for nb in list(Gr.neighbors(s)):
        if (s,nb) in seen: continue
        ch=[s,nb]; seen.add((s,nb)); seen.add((nb,s)); prev,cur=s,nb
        while cur not in junc:
            nx_=[q for q in Gr.neighbors(cur) if q!=prev]
            if not nx_: break
            prev,cur=cur,nx_[0]; ch.append(cur); seen.add((prev,cur)); seen.add((cur,prev))
        if len(ch)>=30: chains.append(ch)
def rdp(pts, eps):
    pts=np.array(pts,float)
    if len(pts)<3: return pts
    a,b=pts[0],pts[-1]; ab=b-a; L=np.hypot(*ab)
    d=np.hypot(*(pts-a).T) if L==0 else np.abs(ab[0]*(pts[:,1]-a[1])-ab[1]*(pts[:,0]-a[0]))/L
    i=int(np.argmax(d))
    if d[i]>eps: return np.vstack([rdp(pts[:i+1],eps)[:-1], rdp(pts[i:],eps)])
    return np.vstack([a,b])
for ch in chains:
    w=float(np.median([dist[y,x] for y,x in ch]))*2*2   # full width m
    P=rdp([(x*2,y*2) for y,x in ch],6)
    out['streams'].append({'width':max(8,int(round(w))),'pts':[[int(x),int(y)] for x,y in P]})
# biomes (on the closed land): smooth class map with a majority filter at ~20 m
def region(mask, close=6, open_=4, minA=20000):
    m=cv2.morphologyEx(mask.astype(np.uint8),cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*close+1,)*2))
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*open_+1,)*2))
    l,k=nd.label(m); polys=[]
    for i in range(1,k+1):
        mm=l==i
        if mm.sum()*4<minA: continue
        polys.append(poly_of(mm,3.0))
    return polys
out['biomes']['mount']=region((G==MOUNT)&closed,4,3,6000)
out['biomes']['desert']=region(np.isin(G,[DESERT,MESA,CANYON])&closed,10,6,40000)
out['biomes']['mesa']=region((G==MESA)&closed,4,3,4000)
out['biomes']['canyon']=region((G==CANYON)&closed,4,3,8000)
out['biomes']['forest']=region(np.isin(G,[FOREST,FOREST2])&closed,8,5,20000)
out['biomes']['field']=region((G==FIELD)&closed,6,3,8000)
out['biomes']['city']=region((G==CITY)&closed,10,4,6000)
json.dump(out,open('land.json','w'))
print('mainland pts',len(out['mainland']),'islands',len(out['islands']),'lakes',len(out['lakes']),'streams',len(out['streams']))
for I in out['islands']: print(' island',I['area'],I['box'],'rock' if I['rock'] else '', round(I['city'],2), len(I['poly']))
for L_ in out['lakes']: print(' lake',L_['area'],len(L_['poly']))
for s in out['streams']: print(' stream w',s['width'],len(s['pts']),s['pts'][0],s['pts'][-1])
for k,v in out['biomes'].items(): print(' biome',k,len(v),[len(p) for p in v][:12])
# preview
img=np.zeros((H,W,3),np.uint8); img[:]=(232,152,0)
pal={'forest':(48,128,24),'desert':(112,176,248),'mount':(128,128,128),'mesa':(72,96,208),'canyon':(192,224,248),'field':(80,208,208),'city':(168,160,144)}
cv2.fillPoly(img,[np.array(out['mainland'])//2],(88,200,128))
for I in out['islands']: cv2.fillPoly(img,[np.array(I['poly'])//2],(88,200,128))
for k in ['forest','desert','canyon','mesa','field','mount','city']:
    for p in out['biomes'][k]: cv2.fillPoly(img,[np.array(p)//2],pal[k])
for L_ in out['lakes']: cv2.fillPoly(img,[np.array(L_['poly'])//2],(232,152,0))
for s in out['streams']: cv2.polylines(img,[np.array(s['pts'])//2],False,(255,190,60),max(1,s['width']//2))
cv2.imwrite('land-preview.png',cv2.resize(img,(W//2,H//2),interpolation=cv2.INTER_AREA))
