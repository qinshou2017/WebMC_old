
import spa from "/src/UI/spa.js";
import GlUtils from "/src/util/GlUtils.js";
import {Mat4, Vec3} from "/src/util/math/glMath.js";
import Block from "/src/Blocks/Block.js";
import {asyncLoadResByUrl, RESOURCES} from "/src/loadResources.js";
import Control from "/src/Control.js";

let shaderSource = {}, render = {};
asyncLoadResByUrl("res/shaders/play_game_page.vertex")
    .then(s => shaderSource.vertex = s);
asyncLoadResByUrl("res/shaders/play_game_page.fragment")
    .then(s => shaderSource.fragment = s);

spa.addEventListener("play_game_page", "load", (pageID, world) => {
    if (pageID !== "loading_terrain_page") return;
    const canvas = document.getElementById("mainGamePage"),
          gl = new GlUtils(canvas),
          prg = gl.createProgram(shaderSource.vertex, shaderSource.fragment);
    gl.clearColor(0.62, 0.81, 1.0, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);
    gl.enable(gl.BLEND);
    gl.useProgram(prg);

    world.setRender(render);

    //test
    window.render = render;
    render.gl = gl;

    render.allRegion = {};
    render.getRegionLightLevel = function(rx, rz) {
        return render.allRegion[rx+','+rz]? render.allRegion[rx+','+rz].lightLevel: null;
    };
    render.refreshRegionLightLevel = function(rx, rz) {
        const regionKey = rx + ',' + rz,
              {sizeX, sizeY, sizeZ} = this.world;
        /*
        最后计算方块当前亮度的时候: max(0,min(15,天光-方块不透明度+方块亮度)) 队列处理光照渲染
        不透明度范围0~16，不透明度为0是透明但不影响亮度的意思，
        不透明度为16是不透明的意思 在渲染时两个不透明度为16的紧挨着将不会渲染这两个面
        */
        rx *= 1; rz *= 1;
        if (rx<0 || rz<0 || rx>=(sizeX>>4) || rz>=(sizeZ>>4)) return;
        var lightLevel = this.getRegionLightLevel(rx, rz);
        if (!lightLevel) {
            lightLevel = new Array(16);
            for (var i=0; i<16; ++i) {
                lightLevel[i] = new Array(sizeY);
                for (var j=0; j<sizeY; ++j){
                    lightLevel[i][j] = new Array(16);
                    for (var k=0; k<16; ++k)
                        lightLevel[i][j][k] = 0;
                }
            }
        }
        var list = [], rerefresh = new Set();
        for (var i=0; i<16; ++i)
          for (var k=0; k<16; ++k)
            for (var j=sizeY-1; ~j; --j) {
                if (this.world.getTile(i+(rx<<4), j, k+(rz<<4)).name === "air") {
                    lightLevel[i][j][k] = 15;
                    if ((i==15||i==0) && this.world.getTile(i+(rx<<4)+(i? 1: -1), j, k).opacity) {
                        var ll = this.getRegionLightLevel(rx+(i? 1: -1), rz);
                        if (ll) {
                            ll = ll[i? 0: 15][j][k];
                            if (ll<14) rerefresh.add([rx+(i? 1: -1), rz]+"");
                        }
                    }
                    if ((k==15||k==0) && this.world.getTile(i, j, k+(rz<<4)+(k? 1: -1)).opacity) {
                        var ll = this.getRegionLightLevel(rx, rz+(k? 1: -1));
                        if (ll) {
                            ll = ll[i][j][k? 0: 15];
                            if (ll<14) rerefresh.add([rx, rz+(k? 1: -1)]+"");
                        }
                    }
                }
                else break;
            }
        for (var i=0; i<16; ++i)
          for (var k=0; k<16; ++k)
            for (var j=sizeY-1; ~j; --j)
                if (lightLevel[i][j][k] != 15)
                    list.push([i, j, k]);

        while (list.length) {
            var [i, j, k] = list.shift();
            lightLevel[i][j][k] = this.world.getTile(i+(rx<<4), j, k+(rz<<4)).opacity>15? 0:
                [[i+1,j,k], [i-1,j,k], [i,j+1,k], [i,j-1,k], [i,j,k+1], [i,j,k-1]]
                .reduce((ans, [x, y, z]) => {
                    if (y>=sizeY || y<0 || x+(rx<<4)>=sizeX || z+(rz<<4)>=sizeZ)
                        return ans;
                    var ll = (x>=16 || z>=16)?
                             this.getRegionLightLevel(rx+(x>=16), rz+(z>=16)):
                             (x<0 || z<0)?
                             this.getRegionLightLevel(rx-(x<0), rz-(z<0)):
                             lightLevel;

                    if (!ll) return ans;
                    ll = ll[x>=0? x%16: 15][y][z>=0? z%16: 15];
                    var b = this.world.getTile(x+(rx<<4), y, z+(rz<<4));
                    return Math.max(ans, Math.min(15, ll-b.opacity+b.luminance-(b.name==="air")));
                }, 0);
            [[i+1,j,k], [i-1,j,k], [i,j+1,k], [i,j-1,k], [i,j,k+1], [i,j,k-1]].forEach(([x, y, z]) => {
                if (y>=sizeY || y<0 || x+(rx<<4)>=sizeX || z+(rz<<4)>=sizeZ)
                    return;
                var ll = (x>=16 || z>=16)?
                         this.getRegionLightLevel(rx+(x>=16), rz+(z>=16)):
                         (x<0 || z<0)?
                         this.getRegionLightLevel(rx-(x<0), rz-(z<0)):
                         lightLevel;
                if (!ll) return;
                ll = ll[~x? x%16: 15][y][~z? z%16: 15];
                if (ll<lightLevel[i][j][k]){
                    if (x>=16 || z>=16) rerefresh.add([rx+(x>=16), rz+(z>=16)]+"");
                    else if (x<0 || z<0) rerefresh.add([rx-(x<0), rz-(z<0)]+"");
                    else list.unshift([x, y, z]);
                }
            });
        }
        this.allRegion[regionKey] = this.allRegion[regionKey] || {};
        this.allRegion[regionKey].lightLevel = lightLevel;
        console.log(regionKey, rerefresh);
        rerefresh.forEach(s => {
            var [x, z] = s.split(",");
            this.refreshRegion(x, z);
        });
    };
    render.refreshRegionModel = function(rx, rz) {
        const regionKey = rx + ',' + rz,
              {sizeX, sizeY, sizeZ} = this.world;
        if (rx>(sizeX>>4) || rz>sizeZ>>4) return;
        var vertexPosition = [], texture = [], color = [],
            lightLevel = this.getRegionLightLevel(rx, rz);

        for (var j=0; j<sizeY; ++j) {
          for (var i=rx<<4,_i=i+16; i<_i; ++i) {
            for (var k=rz<<4,_k=k+16; k<_k; ++k) {
                var block = this.world.getTile(i, j, k);
                if (block.name !== "air" && block.opacity>15) {
                    switch(block.renderType){
                    case Block.renderType.NORMAL: {
                        [[i+1,j,k,"x+"], [i-1,j,k,"x-"], [i,j+1,k,"y+"], [i,j-1,k,"y-"], [i,j,k+1,"z+"], [i,j,k-1,"z-"]].forEach(([x, y, z, key]) => {
                            if (x>=sizeX || x<0 || y>=sizeY || y<0 || z>=sizeX || z<0 ||
                                this.world.getTile(x, y, z).opacity>15)
                                return;
                            var len = block.vertex[key].length;
                            vertexPosition.push(...block.vertex[key].map((v, ind) => ind%3===0? v+i: ind%3===1? v+j: v+k));
                            texture.push(...block.texture.uv[key]);
                            color.push(...[...Array(len/3*4)].map(_ =>
                                Math.pow(0.9, 15-this.getRegionLightLevel(x>>4, z>>4)[x%16][y][z%16])*0.9
                            ));
                        });
                        break;}
                    }
                }
            }
          }
        }

        var index = (len => {
                if (!len) return [];
                let base = [0,1,2, 0,2,3], out = [];
                for(let i=0,j=0; i<=len; j=i++*4)
                    out.push(...base.map(x => x+j));
                return out;
            })(vertexPosition.length/12);
        this.allRegion[regionKey] = this.allRegion[regionKey] || {};
        this.allRegion[regionKey].pos = this.gl.createVbo(vertexPosition);
        this.allRegion[regionKey].col = this.gl.createVbo(color);
        this.allRegion[regionKey].tex = this.gl.createVbo(texture);
        this.allRegion[regionKey].ibo = this.gl.createIbo(index);
        this.allRegion[regionKey].iboLen = index.length;
        console.log(regionKey, this.allRegion[regionKey].lightLevel);
    };
    render.refreshRegion = function(rx, rz) {
        render.refreshRegionLightLevel(rx, rz);
        render.refreshRegionModel(rx, rz);
    };

    for (var i=0,_i=world.sizeX>>4; i<_i; i++){
        for (var j=0,_j=world.sizeZ>>4; j<_j; j++){
            render.refreshRegionLightLevel.call(render, i, j);
        }
    }
    for (var i=0,_i=world.sizeX>>4; i<_i; i++){
        for (var j=0,_j=world.sizeZ>>4; j<_j; j++){
            render.refreshRegionModel.call(render, i, j);
        }
    }

    var {"mvpMatrix": uniMvp, "texture": uniTex} = gl.getCurrentUniforms(),
        textureImg = gl.createTexture(RESOURCES["res/texture/terrain-atlas.png"]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureImg);
    gl.uniform1i(uniTex.loc, 0);

    Object.defineProperty(render, "aspectRatio", {
        get() { return canvas.width/canvas.height; },
        set(v) {}
    });
    var fovy = render.fovy = 90,
        p = world.mainPlayer,
        vM = new Mat4().identity().lookat([p.x, p.y, p.z], p.yaw, p.pitch),
        pM = new Mat4().identity().Cperspective(fovy, render.aspectRatio, 0.1, 500),
        mM = new Mat4().identity();
    p.setControl(new Control(canvas));
    gl.uniformMatrix4fv(uniMvp.loc, false, pM["*"](vM).mul(mM));
    render.aspectRatio = canvas.width/canvas.height;
    render.onresize = () => {
        const {w, h} = gl.fitScreen();
        pM = new Mat4().identity().Cperspective(fovy, w/h, 0.1, 500);
    };
    window.addEventListener("resize", render.onresize);
    render.stopFlag = false;
    render.play = function animation(){
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        p.upData();
        vM = Mat4.identity.lookat([p.x, p.y, p.z], p.yaw, p.pitch);
        gl.uniformMatrix4fv(uniMvp.loc, false, pM.mul(vM).mul(mM));

        for (var regionKey in this.allRegion) {
            var reg = this.allRegion[regionKey];
            this.gl.bindVboByAttributeName("position", reg.pos, 3);
            this.gl.bindVboByAttributeName("color", reg.col, 4);
            this.gl.bindVboByAttributeName("textureCoord", reg.tex, 2);
            this.gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, reg.ibo);
            this.gl.drawElements(gl.TRIANGLES, reg.iboLen, gl.UNSIGNED_SHORT, 0);
        }

        gl.flush();

        if(!this.stopFlag)
            window.requestAnimationFrame(this.play.bind(this));
    };

    render.play();
    render.onresize();
});
spa.addEventListener("play_game_page", "unload", pageID => {
    window.removeEventListener("resize",render.onresize);
    render = {};
});
spa.addEventListener("play_game_page", "overlap", pageID => {
    render.stopFlag = true;
});
spa.addEventListener("play_game_page", "unoverlap", pageID => {
    render.stopFlag = false;
    render.play();
});
