import sys
from PIL import Image, ImageDraw, ImageFont
OX,OY=21,227
FW,FH=6552,4032
sk=Image.open('/home/claude/city-life-auto/docs/world-v3b/sketch-2026-10-14.png').convert('RGB')
# frame image at 2 m/px: frame px (fx/2) = sketch px - (OX/2,OY/2)
fr=Image.new('RGB',(FW//2,FH//2),(0,152,232))
fr.paste(sk,(-OX//2,-OY//2))
def view(name,x0,y0,x1,y1,scale,step=200):
    # x0.. in frame tiles; output scale px per 2m-px
    c=fr.crop((x0//2,y0//2,x1//2,y1//2))
    c=c.resize((int(c.width*scale),int(c.height*scale)),Image.LANCZOS)
    d=ImageDraw.Draw(c)
    f=ImageFont.load_default()
    for x in range((x0//step+1)*step, x1, step):
        X=(x-x0)/2*scale; d.line([(X,0),(X,c.height)],fill=(255,255,255) if x%1000 else (255,0,0),width=1)
        d.text((X+2,2),str(x),fill=(0,0,0),font=f)
    for y in range((y0//step+1)*step, y1, step):
        Y=(y-y0)/2*scale; d.line([(0,Y),(c.width,Y)],fill=(255,255,255) if y%1000 else (255,0,0),width=1)
        d.text((2,Y+2),str(y),fill=(0,0,0),font=f)
    c.save(name)
args=sys.argv[1:]
view(args[0],*map(int,args[1:5]),float(args[5]),int(args[6]) if len(args)>6 else 200)
