# The owner's sketch (2 m/px, 14x9 grid) -> class map at 2 m in the NEW frame (13 x 8 regions: 6552 x 4032 tiles).
# frame tile = 2*px - OX, 2*py - OY.
import numpy as np
from PIL import Image
from scipy import ndimage as nd
OX, OY = 21, 227
FW, FH = 6552, 4032
SK='/home/claude/city-life-auto/docs/world-v3b/sketch-2026-10-14.png'
im=np.asarray(Image.open(SK).convert('RGB')).astype(int)
r,g,b=im[...,0],im[...,1],im[...,2]
H,W=r.shape
def near(c,tol): return (abs(r-c[0])<=tol)&(abs(g-c[1])<=tol)&(abs(b-c[2])<=tol)
C=np.zeros((H,W),np.uint8)
SEA,MEADOW,FOREST,DESERT,MOUNT,MESA,CANYON,BEACH,CITY,FIELD,FOREST2=1,2,3,4,5,6,7,8,9,10,11
C[(b>200)&(r<60)&(g>130)&(g<190)]=SEA
C[near((128,200,88),20)|near((136,200,96),12)|near((128,192,96),10)]=MEADOW
C[near((24,128,48),26)]=FOREST
C[near((88,168,72),12)|near((80,168,72),8)]=FOREST2          # the mid green: forest clearings, field squares
C[near((56,144,64),12)]=FIELD
C[near((208,208,80),24)|near((208,200,80),14)]=FIELD
C[near((248,176,112),16)|near((248,184,120),10)|near((248,184,112),10)]=DESERT
C[(abs(r-g)<=6)&(abs(g-b)<=8)&(r>=118)&(r<=140)]=MOUNT
C[near((208,96,72),26)|near((232,112,80),20)]=MESA
C[near((248,224,192),12)|near((248,216,192),10)]=CANYON
C[near((248,248,200),12)|near((248,248,192),10)]=BEACH
C[(g-r>=8)&(b-r>=14)&(r>=128)&(r<=178)&(b<=200)]=CITY
print('unknown %', round(100*(C==0).mean(),2))
idx=nd.distance_transform_edt(C==0, return_distances=False, return_indices=True)
F=C[idx[0],idx[1]]
# small specks: piers etc. -> majority of surroundings: remove land comps < 300 px (1200 m2) not mountain(rock islets)
land=F!=SEA
lab,n=nd.label(land)
sz=nd.sum(land,lab,range(1,n+1))
for i,s in enumerate(sz):
    if s<120:
        m=lab==(i+1)
        # keep rocks
        if (F[m]==MOUNT).mean()>0.5 and s>=40: continue
        F[m]=SEA
water=F==SEA
lab,n=nd.label(water)
sz=nd.sum(water,lab,range(1,n+1))
for i,s in enumerate(sz):
    if s<30:
        m=lab==(i+1); 
        # fill with neighbouring class
        dil=nd.binary_dilation(m,iterations=2)&~m
        vals=F[dil]; vals=vals[vals!=SEA]
        if len(vals): F[m]=np.bincount(vals).argmax()
# into the new frame at 2 m: frame px (fx//2): sketch px = (fx+OX)/2
fx=np.arange(0,FW,2); fy=np.arange(0,FH,2)
sx=((fx+OX)//2).clip(0,W-1); sy=((fy+OY)//2).clip(0,H-1)
G=F[np.ix_(sy,sx)]
np.save('cls2m.npy',G)
pal=np.array([[255,0,255],[0,152,232],[128,200,88],[24,128,48],[248,176,112],[128,128,128],[208,96,72],[248,224,192],[248,248,200],[144,160,168],[208,208,80],[88,168,72]],np.uint8)
Image.fromarray(pal[G]).save('cls2m.png')
Image.fromarray(pal[G]).resize((G.shape[1]//2,G.shape[0]//2),Image.NEAREST).save('cls2m-preview.png')
names=['?','sea','meadow','forest','desert','mount','mesa','canyon','beach','city','field','forest2']
for k in range(1,12): print(names[k], round(100*(G==k).mean(),2))
print(G.shape)
