const express = require('express');
const app = express();
const port = 8090;

let fs = require( 'fs' );
let path = require( 'path' );

var config_file_path = process.argv[2];
if (!config_file_path) {
    config_file_path = 'config.json';
}

let config_file = fs.readFileSync(config_file_path);
let config = JSON.parse(config_file);

let images_path = config.images_path;
var db_path = config.db_path;
if (!db_path) {
    db_path = './images.db';
}

const sqlite3 = require('sqlite3');
let db = new sqlite3.Database(db_path);

if (images_path) {
    if (fs.existsSync('./images')) {
        fs.unlinkSync('./images');
    }
    fs.symlinkSync(images_path, './images');
}

async function setup(){
    await db.run('CREATE TABLE IF NOT EXISTS images (name TEXT UNIQUE, classes TEXT, complete DATE, classified BOOLEAN);', (result, err)=> {
        if (err){
            throw err;
        }
        else {
            console.log('Initialize images');
            fs.readdir('./images', (err, files) => {
                if (err){
                    throw err;
                }
                else {
                    for (let file of files){
                        console.log(file);
                        db.run('INSERT INTO images (name, classified) VALUES (?, ?)', [file, false], (result, err) => {
                            if(err){
                                console.log('DB Initialization Error: ${err}');
                            }
                        });
                    }
                }
            });
        }
    });
}

if (!fs.existsSync(db_path)){
    setup();
}

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

app.use('/images', express.static('images'));

app.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    if (!req.query['name']) {
        db.get('SELECT name FROM images WHERE classified = 0 ORDER BY name DESC LIMIT 1', (err, result) => {
            if (err) {
                res.send(err);
            }
            else if (result) {
                res.redirect('/?name=' + result['name']);
            }
            else {
                res.render('none.html', {})
            }
        });
    } else {
        db.get('SELECT name, classes FROM images WHERE name = ?', [req.query['name']],  (err, result) => {
            if (err) {
                res.send(err);
            }
            else if (result) {
                res.render('index.html', {image: result['name'], classes: config.classes, image_classes: JSON.parse(result['classes'])});
            }
            else {
                res.render('none.html', {})
            }
        });
    }
    
});

app.post('classify/:action/:image/:className', (req, res) => {
    console.log(req.params.image + ":" + req.params.className);
    var image = req.params.image;
    var className = req.params.className;
    var add = req.params.action.localeCompare('add');
    db.get('SELECT classes FROM images WHERE name = ?', [image], (err, result) => {
        if (err) {
            res.send(err);
        } else if (result) {
            var classes = JSON.parse(result['classes']);
            if (classes && Array.isArray(classes)) {
                classes = new Array(0);                
            }
            var index = classes.findIndex((value) => className.localeCompare(value));
            if (add && index == -1) {
                classes.push([className]);
            } else if (!add && index != -1) {
                classes = classes.filter((value) => !className.localeCompare(value));
            }

            db.run('UPDATE images SET classes = ? WHERE name = ?', [JSON.stringify(classes), req.params.image]);
        }
    });
});

app.get('/next/:image', (req, res) =>{
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    var image = req.params.image;
    var classes = new Array(0);
    var query = req.query;
    for (var property in query) {
        if (query.hasOwnProperty(property)) {
            classes.push(property);
        }
    }
    db.run('UPDATE images SET classes = ?, classified = ?, complete = ? WHERE name = ?',
            [JSON.stringify(classes), true, new Date(), image],
            (result, err) => {
        if (err) {
            res.send(err);
        } else {
            res.redirect('/');
        }
    });
    
});


app.listen(port);