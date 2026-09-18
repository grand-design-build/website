"""Key a white background out of a logo PNG, keeping its real colours
(including the orange dot), then box-downscale with premultiplied alpha."""
import zlib, struct, sys

def read_png(path):
    d=open(path,'rb').read()
    pos=8; idat=b''
    while pos < len(d):
        ln=struct.unpack('>I', d[pos:pos+4])[0]; typ=d[pos+4:pos+8]; data=d[pos+8:pos+8+ln]
        if typ==b'IHDR': w,h,bd,ct,_,_,il = struct.unpack('>IIBBBBB', data)
        elif typ==b'IDAT': idat+=data
        elif typ==b'IEND': break
        pos += 12+ln
    assert bd==8 and ct in (2,6) and il==0, (bd,ct,il)
    ch = 4 if ct==6 else 3
    raw=zlib.decompress(idat); stride=w*ch
    prev=bytearray(stride); rows=[]; i=0
    for y in range(h):
        ft=raw[i]; i+=1
        line=bytearray(raw[i:i+stride]); i+=stride
        if ft:
            for x in range(stride):
                a=line[x-ch] if x>=ch else 0
                b=prev[x]
                c=prev[x-ch] if x>=ch else 0
                if   ft==1: line[x]=(line[x]+a)&255
                elif ft==2: line[x]=(line[x]+b)&255
                elif ft==3: line[x]=(line[x]+((a+b)>>1))&255
                elif ft==4:
                    p=a+b-c; pa=abs(p-a); pb=abs(p-b); pc=abs(p-c)
                    pr=a if (pa<=pb and pa<=pc) else (b if pb<=pc else c)
                    line[x]=(line[x]+pr)&255
        prev=line; rows.append(bytes(line))
    return w,h,ch,rows

def write_png(path,w,h,px):                      # px = flat RGBA bytearray
    raw=bytearray()
    for y in range(h):
        raw.append(0)
        raw += px[y*w*4:(y+1)*w*4]
    def chunk(t,d):
        c=struct.pack('>I',len(d))+t+d
        return c+struct.pack('>I', zlib.crc32(t+d)&0xffffffff)
    out=b'\x89PNG\r\n\x1a\n'
    out+=chunk(b'IHDR', struct.pack('>IIBBBBB',w,h,8,6,0,0,0))
    out+=chunk(b'IDAT', zlib.compress(bytes(raw),9))
    out+=chunk(b'IEND', b'')
    open(path,'wb').write(out)

def process(src,dst,target_w,pad=6):
    w,h,ch,rows=read_png(src)
    def get(x,y):
        o=x*ch; r,g,b = rows[y][o],rows[y][o+1],rows[y][o+2]
        a = rows[y][o+3] if ch==4 else 255
        return r,g,b,a

    # Some marks (the white-on-dark one) are ALREADY transparent. Keying them
    # would erase the artwork, so detect that and only trim + downscale.
    already = ch==4 and get(1,1)[3]==0 and get(w-2,1)[3]==0 and get(1,h-2)[3]==0

    # 1. alpha from how far the pixel is from white; soft ramp keeps edges smooth
    rgba=bytearray(w*h*4)
    for y in range(h):
        for x in range(w):
            r,g,b,a0 = get(x,y)
            if already:
                a=a0
            else:
                m=min(r,g,b)
                if   m>=250: a=0
                elif m<=205: a=255
                else:        a=int(round((250-m)*255/45))
                a = a*a0//255
                if a==0:
                    r=g=b=0
                else:
                    # un-matte: the pixel was composited over white
                    f=255.0/a
                    r=max(0,min(255,int(round((r-255)*f+255))))
                    g=max(0,min(255,int(round((g-255)*f+255))))
                    b=max(0,min(255,int(round((b-255)*f+255))))
            o=(y*w+x)*4
            rgba[o]=r; rgba[o+1]=g; rgba[o+2]=b; rgba[o+3]=a

    # 2. trim to the artwork, then re-pad evenly
    minx,miny,maxx,maxy=w,h,-1,-1
    for y in range(h):
        for x in range(w):
            if rgba[(y*w+x)*4+3]>8:
                if x<minx: minx=x
                if x>maxx: maxx=x
                if y<miny: miny=y
                if y>maxy: maxy=y
    minx=max(0,minx-pad); miny=max(0,miny-pad)
    maxx=min(w-1,maxx+pad); maxy=min(h-1,maxy+pad)
    cw=maxx-minx+1; chh=maxy-miny+1
    crop=bytearray(cw*chh*4)
    for y in range(chh):
        s=((y+miny)*w+minx)*4
        crop[y*cw*4:(y+1)*cw*4] = rgba[s:s+cw*4]

    # 3. box downscale on premultiplied alpha
    tw=target_w; th=max(1,int(round(chh*tw/cw)))
    out=bytearray(tw*th*4)
    for ty in range(th):
        y0=ty*chh//th; y1=max(y0+1,(ty+1)*chh//th)
        for tx in range(tw):
            x0=tx*cw//tw; x1=max(x0+1,(tx+1)*cw//tw)
            R=G=B=A=0; n=0
            for yy in range(y0,y1):
                for xx in range(x0,x1):
                    o=(yy*cw+xx)*4; a=crop[o+3]
                    R+=crop[o]*a; G+=crop[o+1]*a; B+=crop[o+2]*a; A+=a; n+=1
            o=(ty*tw+tx)*4
            if A:
                out[o]=min(255,R//A); out[o+1]=min(255,G//A); out[o+2]=min(255,B//A)
            out[o+3]=A//n
    write_png(dst,tw,th,out)
    return cw,chh,tw,th

if __name__=='__main__':
    print(process(sys.argv[1], sys.argv[2], int(sys.argv[3])))
