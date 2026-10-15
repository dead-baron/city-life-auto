# Trace the sketch's coloured lines into polylines in NEW frame tiles (frame = 2*px - (OX, OY)).
import numpy as np, json, sys
from PIL import Image, ImageDraw
from scipy import ndimage as nd
from skimage.morphology import skeletonize, disk, binary_closing, remove_small_objects
import networkx as nx
OX, OY = 21, 227
SK='/home/claude/city-life-auto/docs/world-v3b/sketch-2026-10-14.png'
im=np.asarray(Image.open(SK).convert('RGB')).astype(int)
r,g,b=im[...,0],im[...,1],im[...,2]
def near(c,tol): return (abs(r-c[0])<=tol)&(abs(g-c[1])<=tol)&(abs(b-c[2])<=tol)
masks={
 'hwy': near((248,152,24),28)|near((248,160,40),20),
 'rail': (r<112)&(g<124)&(b<112)&~((g>110)&(r<40)),
 'yellow': near((248,224,16),40)|near((240,216,96),30)|near((248,232,120),24),
 'pink': near((224,136,216),40)|near((240,80,220),40)|near((240,170,230),24),
 'road': (abs(r-g)<=8)&(abs(g-b)<=10)&(r>=176)&(r<=236),
}
def trace(mask, close, minlen, prune):
    m=binary_closing(mask, disk(close))
    m=remove_small_objects(m, 60)
    sk=skeletonize(m)
    ys,xs=np.nonzero(sk)
    G=nx.Graph()
    S=set(zip(ys.tolist(),xs.tolist()))
    for (y,x) in S:
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                if (dy or dx) and (y+dy,x+dx) in S: G.add_edge((y,x),(y+dy,x+dx))
    # prune spurs
    for _ in range(4):
        ends=[n for n in G.nodes if G.degree(n)==1]
        removed=0
        for e in ends:
            if e not in G: continue
            path=[e]; cur=e; prev=None
            while True:
                nb=[n for n in G.neighbors(cur) if n!=prev]
                if len(nb)!=1 or G.degree(cur)>2 and cur!=e: break
                prev,cur=cur,nb[0]; path.append(cur)
                if G.degree(cur)!=2: break
                if len(path)>prune: break
            if len(path)<=prune and G.degree(path[-1])>=3:
                G.remove_nodes_from(path[:-1]); removed+=1
        if not removed: break
    # collapse diagonal-pixel clusters: nodes of degree>2 within 2px are one junction; split into chains
    out=[]
    visited=set()
    junc=set(n for n in G.nodes if G.degree(n)!=2)
    for s in junc:
        for nb in list(G.neighbors(s)):
            if (s,nb) in visited: continue
            chain=[s,nb]; visited.add((s,nb)); visited.add((nb,s)); prev,cur=s,nb
            while cur not in junc:
                nxt=[n for n in G.neighbors(cur) if n!=prev]
                if not nxt: break
                prev,cur=cur,nxt[0]; chain.append(cur); visited.add((prev,cur)); visited.add((cur,prev))
            if len(chain)>=minlen: out.append(chain)
    # pure cycles (no junctions)
    for comp in nx.connected_components(G):
        if all(G.degree(n)==2 for n in comp) and len(comp)>=minlen:
            cyc=[n for n in nx.dfs_preorder_nodes(G.subgraph(comp))]
            out.append(cyc+[cyc[0]])
    return out
def rdp(pts, eps):
    pts=np.array(pts,float)
    if len(pts)<3: return pts
    a,b=pts[0],pts[-1]; ab=b-a; L=np.hypot(*ab)
    if L==0: d=np.hypot(*(pts-a).T)
    else: d=np.abs(ab[0]*(pts[:,1]-a[1])-ab[1]*(pts[:,0]-a[0]))/L
    i=int(np.argmax(d))
    if d[i]>eps: return np.vstack([rdp(pts[:i+1],eps)[:-1], rdp(pts[i:],eps)])
    return np.vstack([a,b])
res={}
cfg={'hwy':(3,25,20),'rail':(4,25,20),'yellow':(7,20,16),'pink':(7,20,16),'road':(2,30,14)}
for k,mask in masks.items():
    close,minlen,prune=cfg[k]
    chains=trace(mask,close,minlen,prune)
    polys=[]
    for c in chains:
        P=[(x*2-OX, y*2-OY) for (y,x) in c]
        S=rdp(P, 4.0)
        polys.append([[int(round(x)),int(round(y))] for x,y in S])
    res[k]=polys
    print(k, len(polys), 'chains, total pts', sum(len(p) for p in polys), 'len km', round(sum(sum(np.hypot(*np.diff(np.array(p,float),axis=0).T)) for p in polys)/1000,1))
json.dump(res, open('lines.json','w'))
# preview over the class map
cls=Image.open('cls2m.png').convert('RGB')
im2=cls.resize((cls.width//2, cls.height//2))
d=ImageDraw.Draw(im2)
col={'hwy':(255,120,0),'rail':(0,0,0),'yellow':(255,230,0),'pink':(255,0,200),'road':(255,255,255)}
for k in ['road','hwy','rail','yellow','pink']:
    for p in res[k]:
        d.line([(x/4,y/4) for x,y in p], fill=col[k], width=1 if k=='road' else 2)
im2.save('lines-preview.png')
