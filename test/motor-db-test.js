var fs=require("fs");
var expect=require("expect.js");

var Promise=require('es6-promise').Promise;
var motorDb=require('..');

var config_dbs=require('./config-test.json');
var nombre_config_local=require.resolve('./config-test.json')+'.local';
if(fs.existsSync(nombre_config_local)){
    var config_dbs_local=fs.readFileSync(nombre_config_local,{encoding:'utf-8'});
    var nuevos_elementos=JSON.parse(config_dbs_local);
    config_dbs=config_dbs.concat(nuevos_elementos);
    console.log('Probando con algunos elementos locales',config_dbs);
}

motorDb.publicarMotores();

describe('Cosas estáticas de la BaseDeDatos', function(){
    var db;
    beforeEach(function(){
        db=motorDb.nuevaConexion({motor:'pg'});
    });
    it('debe detectar el motor del Postgresql',function(){
        expect(db).to.be.a(motorDb.Postgres);
    });
    it('armar el SQL para un insert',function(){
        var param={uno:1, dos:'dos', tres:new Date(2012,11,23), cuatro:true, cinco:null};
        expect(db.armarSql("INSERT INTO T1(???1CAMPOS) VALUES (???1PARAMS)",param)).to.eql(
            [ "INSERT INTO T1(uno, dos, tres, cuatro, cinco) VALUES ($1, $2, $3, $4, $5)",
              [1, 'dos', new Date(2012,11,23), true, null]
            ]
        );
    });
    it('armar el SQL para un insert si no existe',function(){
        var param={uno:1, dos:'dos'};
        expect(db.armarSql("INSERT INTO T1 (???1CAMPOS) SELECT * FROM (SELECT ???1PARAMS_pref_)",param)).to.eql(
            [ "INSERT INTO T1 (uno, dos) SELECT * FROM (SELECT $1::numeric as _pref_uno, $2::text as _pref_dos)",
              [1, 'dos']
            ]
        );
    });
    it('armar el SQL para un update',function(){
        var param1={uno:1, dos:null};
        var param2={tres:3, cuatro:'cuatro'};
        expect(db.armarSql("UPDATE T1 SET ???1SET WHERE ???2AND",param1,param2)).to.eql(
            [ "UPDATE T1 SET uno=$1, dos=$2 WHERE tres=$3 AND cuatro=$4",
              [1, null, 3, 'cuatro']
            ]
        );
    });
    it('armar el SQL traduce el SQL',function(){
        expect(db.armarSql("CREATE TABLE T1()WITHOUT ROWID;")[0]).to.eql(
            "CREATE TABLE T1();"
        );
    });
    it('strips UTF8-BOM from SQL',function(){
        expect(db.armarSql("\ufeffCREATE TABLE T1();")[0]).to.eql(
            "CREATE TABLE T1();"
        );
        expect(db.armarSql("\ufeffCREATE TABLE T1();")[0]).to.eql(
            "CREATE TABLE T1();"
        );
    });
})

function copiar_objeto(o){ 
    if(o instanceof Date){
        var n=new Date(o);
    }else if(o instanceof Array){
        var n=o.slice(0);
    }else if(o instanceof Object){
        var n={};
        for(var k in o){
            n[k]=o[k];
        }
    }else{
        var n=o;
    }
    return n;
}

function describir(o){
    if(typeof o=='object'){
        return "["+o.constructor.name+"]"+o+"{"+Object.keys(o,function(k){ return k+":"+describir(o); }).join(', ')+"}";
    }else{
        return "[T:"+typeof o+"]"+o;
    }
}

describe('operaciones con datos ',function(){
  var datos_ins={numero:1, texto:'dos', fecha:new Date(1810,5,25), si:true, no:false, nulo:null, monto:123456.77, flotante:123456.77, vacio:'', largo:'dos\nlineas'};
  var datos_esperados={
    pg:datos_ins, // espero que postgresql sea perfecto!
    mysql:copiar_objeto(datos_ins), // sería deseable que mysql sea perfecto pero hay que cambiar los boolean
    sqlite3:copiar_objeto(datos_ins), // también tengo que cambiar las fechas
  };
  var SIN_BOOL=['mysql','sqlite3'];
  SIN_BOOL.forEach(function(motor){
    datos_esperados[motor].si=1;
    datos_esperados[motor].no=0;
  });
  datos_esperados.sqlite3.fecha=datos_ins.fecha-new Date("1970-01-01 00:00:00 UTC");
  config_dbs.forEach(function(config_db){
    describe('BaseDeDatos '+config_db.motor, function(){
        var db;
        beforeEach(function(done){
            db=motorDb.nuevaConexion(config_db);
            expect(db.db).to.be.ok();
            db.ejecutar("DROP TABLE IF EXISTS prueba;").then(function(){
                return db.ejecutar("CREATE TABLE prueba (numero INTEGER, texto VARCHAR(10), fecha DATE, si BOOLEAN, no BOOLEAN, nulo BOOLEAN, monto NUMERIC(19,6), flotante DOUBLE PRECISION, vacio VARCHAR(20), largo TEXT);");
            }).then(done.bind(null,null),done);
        });
        afterEach(function(done){
            // this.timeout(5000);
            db.cerrar().then(done.bind(null,null),done);
        });
        it('debe devolver 1 uno en un count+1 de una tabla vacía',function(done){
            db.dato("SELECT count(*)+1 FROM prueba").then(function(cantidad){
                expect(cantidad).to.be.equal(1);
            }).then(done,done);
        });
        ['objeto','par de arreglos'].forEach(function(modo_insertar){
            it('debe insertar y devolver lo que insertó',function(done){
                var promesa;
                if(modo_insertar=='objeto'){
                    promesa=db.insertar('prueba',datos_ins);
                }else{
                    promesa=db.insertar('prueba',Object.keys(datos_ins),Object.keys(datos_ins).map(function(campo){return datos_ins[campo];}));
                }
                expect(promesa).to.be.a(Promise);
                promesa.then(function(){
                    return db.dato("SELECT count(*) FROM prueba")
                }).then(function(cantidad){
                    expect(cantidad).to.be.equal(1);
                }).then(function(){
                    return db.fila("SELECT * FROM prueba");
                }).then(function(fila){
                    expect(describir(fila.fecha)).to.be.equal(describir(datos_esperados[config_db.motor].fecha));
                    expect(fila).to.eql(datos_esperados[config_db.motor]);
                }).then(done,done);
            });
        });
        it('debe informar el estado de lo que acaba de insertar',function(done){
            db.ejecutar('DROP TABLE IF EXISTS t_con_autonum;').then(function(){
                return db.ejecutar('CREATE TABLE t_con_autonum (num integer primary key auto_increment, texto VARCHAR(10))');
            }).then(function(){
                return db.ejecutar("INSERT INTO t_con_autonum (texto) VALUES ('este texto') RETURNING num as ultimo_id");
            }).then(function(estado){
                expect(estado.ultimo_id).to.be.equal(1);
                expect(estado.cambios).to.be.equal(1);
                return db.todo("SELECT * FROM t_con_autonum");
            }).then(function(todo){
                expect(todo).to.eql(
                    [{num: 1, texto:'este texto'}]
                );
            }).then(function(){
                return db.ejecutar(
                    "INSERT INTO t_con_autonum (???1CAMPOS) SELECT * FROM (SELECT ???1PARAMS_nuev_) x "+
                    "    WHERE NOT EXISTS (SELECT 1 FROM t_con_autonum WHERE texto = _nuev_texto) RETURNING num as ultimo_id",
                    {texto:'este texto'}
                );
            }).then(function(estado){
                // expect(!estado.cambios).to.be.ok();
                return db.todo("SELECT * FROM t_con_autonum");
            }).then(function(todo){
                expect(todo).to.eql(
                    [{num: 1, texto:'este texto'}]
                );
            }).then(done,done);
        });
        it('debe avisar si hay más de una fila',function(done){
            db.insertar('prueba',datos_ins).then(function(){
                return db.insertar('prueba',{numero:2});
            }).then(function(){
                return db.dato('select numero from prueba');
            }).then(function(dato){
                // expect().fail("debe fallar porque hay más de un registro");
                done(new Error("debe fallar porque hay más de un registro"));
            }).catch(function(err){
                console.log('veo este error',err);
                done();
            });
        });
        it('debe avisar si hay más de una columna',function(done){
            db.insertar('prueba',datos_ins).then(function(){
                return db.dato('select * from prueba');
            }).then(function(dato){
                done(new Error("debe fallar porque hay más de una columna"));
            }).catch(function(err){
                console.log('veo este error2',err);
                done();
                // ok, no debe haber más de una columna
            });
        });
        it('debe insertar sin duplicados',function(done){
            db.insertar('prueba',datos_ins).then(function(){
                return db.insertar('prueba',datos_ins,{saltearPorCampos:['numero','texto']});
            }).then(function(estado){
                expect(!estado.cambios).to.ok();
            }).then(function(){
                return db.todo("SELECT * FROM prueba");
            }).then(function(todo){
                expect(todo).to.eql([datos_esperados[config_db.motor]]);
            }).then(done,done);
        });
        it('el ILIKE existe en todos los motores y es insensitivo',function(done){
            db.dato("select 'a' ilike 'A'").then(function(respuesta){
                expect(respuesta).to.ok();
            }).then(done,done);
        });
        it('el LIKE da error',function(done){
            db.dato("select 'a' like 'A'").then(function(respuesta){
                expect().fail('debe rechazar LIKE porque funciona distinto en cada motor');
            }).catch(function(){
                // ok, rechazó el like
            }).then(done,done);
        });
    });
  });
});
