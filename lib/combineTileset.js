'use strict';
var Cesium = require('cesium');
var fsExtra = require('fs-extra');
var path = require('path');

var defaultValue = Cesium.defaultValue;
var defined = Cesium.defined;

module.exports.combineTileset = combineTileset;
module.exports.mergeTileset = mergeTileset;

/**
 * Combine tileset into one tileset json.
 * @param {Object} options Object with following properties.
 * @param {String} options.inputDir Input directory include tilesets.
 * @param {String} [options.outputTileset="tileset.json"] Output tileset file path.
 */
function combineTileset(options) {
    var west = Number.POSITIVE_INFINITY;
    var south = Number.POSITIVE_INFINITY;
    var north = Number.NEGATIVE_INFINITY;
    var east = Number.NEGATIVE_INFINITY;
    var minheight = Number.POSITIVE_INFINITY;
    var maxheight = Number.NEGATIVE_INFINITY;
    var inputDir = defaultValue(options.inputDir, './');
    var outputTileset = defaultValue(options.outputDir, path.join(inputDir, 'tileset.json'));

    var geometricError = 500;
    var children = [];
    var promises = [];
    var jsonFiles = [];
    inputDir = path.normalize(inputDir);
    outputTileset = path.normalize(outputTileset);
    var outputDir = path.dirname(outputTileset);

    getJsonFiles(inputDir, jsonFiles);
    jsonFiles.forEach(function(jsonFile) {
        var promise = fsExtra.readJson(jsonFile)
            .then(function(json) {
                if(!json.root) {return Promise.resolve();}
                var boundingVolume = json.root.boundingVolume;
                var geometricError = json.geometricError;
                var refine = json.root.refine;

                if (defined(boundingVolume) && defined(geometricError)) {
                    // Use external tileset instand of b3dm.
                    var url = path.relative(outputDir, jsonFile);
                    url = url.replace(/\\/g, '/');

                    // Only support region for now.
                    if(boundingVolume.region) {
                        west = Math.min(west, boundingVolume.region[0]);
                        south = Math.min(south, boundingVolume.region[1]);
                        east = Math.max(east, boundingVolume.region[2]);
                        north = Math.max(north, boundingVolume.region[3]);
                        minheight = Math.min(minheight, boundingVolume.region[4]);
                        maxheight = Math.max(maxheight, boundingVolume.region[5]);
                    }

                    var child = {
                        'boundingVolume': boundingVolume,
                        'geometricError': geometricError,
                        'refine': refine,
                        'content': {
                            'url': url
                        }
                    };
                    children.push(child);
                }
            })
            .catch(function(err) {
                throw Error(err);
            });

        promises.push(promise);
    });

    return Promise.all(promises).then(function() {
        var tileset = {
            'asset': {
                'version': '0.0',
                'tilesetVersion': '1.0.0-obj23dtiles',
            },
            'geometricError': geometricError,
            'root': {
                'boundingVolume': {
                    'region': [
                        west,
                        south,
                        east,
                        north,
                        minheight,
                        maxheight
                    ]
                },
                'refine': 'ADD',
                'geometricError': geometricError,
                'children': children
            }
        };

        return Promise.resolve({
            tileset: tileset,
            output: outputTileset
        });
    });
}

/**
 * merge tileset into one tileset json.
 * @param {Object} options Object with following properties.
 * @param {String} options.inputDir Input directory include tilesets.
 * @param {String} [options.outputTileset="tileset.json"] Output tileset file path.
 */
function mergeTileset(options) {
    var west = Number.POSITIVE_INFINITY;
    var south = Number.POSITIVE_INFINITY;
    var north = Number.NEGATIVE_INFINITY;
    var east = Number.NEGATIVE_INFINITY;
    var minheight = Number.POSITIVE_INFINITY;
    var maxheight = Number.NEGATIVE_INFINITY;
    var inputDir = defaultValue(options.inputDir, './');
    var outputTileset = defaultValue(options.outputDir, path.join(inputDir, 'tileset.json'));

    var geometricError = 500;
    var children = [];
    var promises = [];
    var jsonFiles = [];
    var lodEnabled = false;
    var transform;
    inputDir = path.normalize(inputDir);
    outputTileset = path.normalize(outputTileset);
    var outputDir = path.dirname(outputTileset);

    getJsonFiles(inputDir, jsonFiles);
    jsonFiles.forEach(function(jsonFile) {
        var promise = fsExtra.readJson(jsonFile)
            .then(function(json) {
                if(!json.root) {return Promise.resolve();}
                var boundingVolume = json.root.boundingVolume;
                var geometricError = json.geometricError;
                if (!transform) {
                    transform = json.root.transform;
                }

                if (defined(boundingVolume) && defined(geometricError)) {
                    // Use external tileset instand of b3dm.
                    var url = path.relative(outputDir, jsonFile);
                    url = url.replace(/\\/g, '/');
                    url = url.substr(0, url.length-'tileset.json'.length);
                    url += json.root.content.url;

                    // Only support region for now.
                    if(boundingVolume.region) {
                        west = Math.min(west, boundingVolume.region[0]);
                        south = Math.min(south, boundingVolume.region[1]);
                        east = Math.max(east, boundingVolume.region[2]);
                        north = Math.max(north, boundingVolume.region[3]);
                        minheight = Math.min(minheight, boundingVolume.region[4]);
                        maxheight = Math.max(maxheight, boundingVolume.region[5]);
                    }

                    var currentDir = path.dirname(jsonFile);
                    var b3dmFilename = json.root.content.url.substr(0, json.root.content.url.length-'.b3dm'.length);
                    //url = path.relative(outputDir, path.join(currentDir, b3dmFilename+'.b3dm'));
                    //url = url.replace(/\\/g, '/');
                    var batchName = b3dmFilename + '_batchTable.json';
                    var batchFile = path.join(currentDir, batchName);
                    var batchJson = fsExtra.readJSONSync(batchFile);
                    var xMax = Number.MIN_VALUE;
                    var yMax = Number.MIN_VALUE;
                    var zMax = Number.MIN_VALUE;
                    var xMin = Number.MAX_VALUE;
                    var yMin = Number.MAX_VALUE;
                    var zMin = Number.MAX_VALUE;
                    var minMax;
                    if (batchJson && batchJson.maxPoint && batchJson.minPoint) {
                        lodEnabled = true;
                        batchJson.maxPoint.forEach(function (p){
                            if (p[0] > xMax) {xMax = p[0];}
                            if (p[1] > yMax) {yMax = p[1];}
                            if (p[2] > zMax) {zMax = p[2];}
                        });
                        batchJson.minPoint.forEach(function (p){
                            if (p[0] < xMin) {xMin = p[0];}
                            if (p[1] < yMin) {yMin = p[1];}
                            if (p[2] < zMin) {zMin = p[2];}
                        });
                        minMax = {
                            minPnt: [xMin, yMin, zMin],
                            maxPnt: [xMax, yMax, zMax]
                        };
                        var ge0 = Math.max(xMax - xMin, yMax-yMin);
                        ge0 = Math.max(ge0, zMax-zMin);
                        ge0 /= 20.0;
                        geometricError = ge0;
                    }

                    var child = {
                        'boundingVolume': boundingVolume,
                        'geometricError': geometricError,
                        //'refine': refine,
                        'content': {
                            'url': url,
                            'boundingVolume': boundingVolume,
                        },
                        minMax: minMax,
                        jsonFile: jsonFile
                    };
                    if (lodEnabled) {
                        child.batchFile = batchFile;
                    }
                    children.push(child);
                }
            })
            .catch(function(err) {
                throw Error(err);
            });

        promises.push(promise);
    });

    return Promise.all(promises).then(function() {
        var ge = geometricError;
        if (lodEnabled) {
            children = sortChildren(children);
            ge /= 2.0;
        }
        var tileset = {
            'asset': {
                'version': '0.0',
                'tilesetVersion': '1.0.0-obj23dtiles',
            },
            'geometricError': geometricError,
            'root': {
                'boundingVolume': {
                    'region': [
                        west,
                        south,
                        east,
                        north,
                        minheight,
                        maxheight
                    ]
                },
                'refine': 'ADD',
                'geometricError': ge,
                'children': children,
                'transform': transform
            }
        };

        return Promise.resolve({
            tileset: tileset,
            output: outputTileset
        });
    });
}

  // http://blog.benoitvallon.com/sorting-algorithms-in-javascript/sorting-algorithms-in-javascript-all-the-code/
  function selectionSort(array) {
    for(var i = 0; i < array.length; i++) {
      var min = i;
      for(var j = i + 1; j < array.length; j++) {
        var sign = compareTile(array[min].minMax, array[j].minMax);
        if(sign === 1) { // array[j] < array[min]
          min = j;
        } else if (sign === 0) {
            var vMin = getVolume(array[min].minMax);
            var vJ = getVolume(array[j].minMax);
            if (vMin > vJ) {
                min = j;
            }
        }
      }
      if(i !== min) {
        swap(array, i, min);
      }
    }
    return array;

    // swap function helper
    function swap(array, i, j) {
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
  }

function sortChildren(tilesets) {
    console.log('tilesets count1: ', tilesets.length);
    tilesets = selectionSort(tilesets);
    //tilesets.sort( function(a,b) {return compareTile(a.minMax, b.minMax);} );
    console.log('tilesets count2: ', tilesets.length);
    var nodes = [];

    var ts0 = tilesets[tilesets.length-1];
    if (!ts0.children) {ts0.children = [];}
    nodes.push(ts0);
    var parent = null;
    var current = nodes[0];

    for(var i = tilesets.length-1;i>0;i--) {
        var j = i - 1;
        var node = tilesets[j];
        var sign = compareTile(tilesets[i].minMax, tilesets[j].minMax);
        if (sign === 1) {
            if (!current.children) {
                current.children = [];
            }
            current.children.push(node);
            parent = current;
        } else if (sign === 0) {
            if (parent !== null) {
                if (!parent.children) {
                    parent.children = [];
                }
                parent.children.push(node);
            } else {
                nodes.push(node);
            }
        } else {
            console.log('noway: ', i, ' sign: ', sign, ' ', node.content.url);
            console.log('noway: ', i, JSON.stringify(tilesets[i].minMax));
            console.log('noway: ', j, JSON.stringify(tilesets[j].minMax));
        }
        current = node;
        tilesets[i].minMax = undefined;
        if (tilesets[i].jsonFile) {
            //fsExtra.unlinkSync(tilesets[i].jsonFile);
            tilesets[i].jsonFile = undefined;
        }
        if (tilesets[i].batchFile) {
            fsExtra.unlinkSync(tilesets[i].batchFile);
            tilesets[i].batchFile = undefined;
        }
    }
    tilesets[0].minMax = undefined;
    if (tilesets[0].jsonFile) {
        //fsExtra.unlinkSync(tilesets[0].jsonFile);
        tilesets[0].jsonFile = undefined;
    }
    if (tilesets[0].batchFile) {
        fsExtra.unlinkSync(tilesets[0].batchFile);
        tilesets[0].batchFile = undefined;
    }
    return nodes;


}

function compareTileArray(minMax1, minMax2) {
    var xWest = minMax1.minPnt[0]; //xTile.OriginalX.Min;
    var xSouth = minMax1.minPnt[2]; //xTile.OriginalZ.Min;
    var xEast = minMax1.maxPnt[0]; //xTile.OriginalX.Max;
    var xNorth = minMax1.maxPnt[2]; //xTile.OriginalZ.Max;
    var xMin = minMax1.minPnt[1]; //xTile.OriginalY.Min;
    var xMax = minMax1.maxPnt[1]; //xTile.OriginalY.Max;

    var yWest = minMax2.minPnt[0]; //yTile.OriginalX.Min;
    var ySouth = minMax2.minPnt[2]; //yTile.OriginalZ.Min;
    var yEast = minMax2.maxPnt[0]; //yTile.OriginalX.Max;
    var yNorth = minMax2.maxPnt[2]; //yTile.OriginalZ.Max;
    var yMin = minMax2.minPnt[1]; //yTile.OriginalY.Min;
    var yMax = minMax2.maxPnt[1]; //yTile.OriginalY.Max;

    var weSign = compareXToY(xWest, xEast, yWest, yEast);
    var nsSign = compareXToY(xSouth, xNorth, ySouth, yNorth);
    var heitSign = compareXToY(xMin, xMax, yMin, yMax);
    return [weSign, nsSign, heitSign];
}

function getVolume(minMax1) {
    var xWest = minMax1.minPnt[0]; //xTile.OriginalX.Min;
    var xSouth = minMax1.minPnt[2]; //xTile.OriginalZ.Min;
    var xEast = minMax1.maxPnt[0]; //xTile.OriginalX.Max;
    var xNorth = minMax1.maxPnt[2]; //xTile.OriginalZ.Max;
    var xMin = minMax1.minPnt[1]; //xTile.OriginalY.Min;
    var xMax = minMax1.maxPnt[1]; //xTile.OriginalY.Max;
    return (xEast-xWest)+(xNorth-xSouth)+(xMax-xMin);
}

function compareTile(minMax1, minMax2) {
    var res = compareTileArray(minMax1, minMax2);
    var weSign = res[0];
    var nsSign = res[1];
    var heitSign = res[2];
    if (weSign === -1 && nsSign === -1 && heitSign === -1)
    {
        return -1;
    }
    if (weSign === 1 && nsSign === 1 && heitSign === 1)
    {
        return 1;
    }
    return 0;
}

function compareXToY(aMin, aMax, bMin, bMax)
{
    if (aMin >= bMin && aMax < bMax) {return -1;}
    if (aMin <= bMin && aMax > bMax) {return 1;}
    return 0;
}



function getJsonFiles(dir, jsonFiles) {
    var files = fsExtra.readdirSync(dir);
    files.forEach(function (itm) {
        var fullpath = path.join(dir, itm);
        var stat = fsExtra.statSync(fullpath);
        if (stat.isDirectory()) {
            readFileList(fullpath, jsonFiles);
        }
    });
}

function readFileList(dir, jsonFiles) {
    var files = fsExtra.readdirSync(dir);
    files.forEach(function (itm) {
        var fullpath = path.join(dir, itm);
        var stat = fsExtra.statSync(fullpath);
        if (stat.isDirectory()) {
            readFileList(fullpath, jsonFiles);
        } else {
            var ext = path.extname(fullpath);
            if (ext === '.json'){
                jsonFiles.push(fullpath);
            }
        }
    });
}
