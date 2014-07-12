module.exports=function(contexto){

var colors=require('colors');
var expect=require('expect.js');

var Promise=contexto.Promise;

publico={};

var metodos='cerrar,ejecutar,todo'.split(',');

var drivers={ 
    multiple:true // este es un driver especial que no necesita inicializar
};
var motores={};

var BaseDeDatos=function(definicion){
    this.id=!definicion?'dbVacia':(typeof definicion=="string"?definicion:definicion.database); // OJO QUE NO HAYA CLAVES
    this.log={
        todo:{
        },
        error:{
            cerrar:true,
            ejecutar:true
        }
    };
    // this.log.todo=this.log.error;
};

var Sqlite=motores.Sqlite=function(definicion){
    BaseDeDatos.call(this,definicion);
};
Sqlite.prototype=Object.create(BaseDeDatos.prototype);

var Mysql=motores.Mysql=function(definicion){
    BaseDeDatos.call(this,definicion);
};
Mysql.prototype=Object.create(BaseDeDatos.prototype);

var Postgres=motores.Postgres=function(definicion){
    BaseDeDatos.call(this,definicion);
};
Postgres.prototype=Object.create(BaseDeDatos.prototype);

var Multiple=motores.Multiple=function(descripciones){
    this.id='multiples_dbs';
    this.cons=descripciones.map(function(descripcion){
        return publico.nuevaConexion(descripcion);
    });
};

Multiple.registrarFuncionPrometedora=function(nombreFuncion){
    Multiple.prototype[nombreFuncion]=function(){
        var argumentosOriginales=arguments;
        var respuestas=[];
        var errores=[];
        var esto=this;
        return Promise.all(this.cons.map(function(conexion,index){
            return conexion[nombreFuncion].apply(conexion,argumentosOriginales).then(function(result){
                respuestas[index]=result;
            }).catch(function(err){
                errores[index]=err;
                throw err;
            });
        })).then(function(){
            if(esto.cons.every(function(conexion,index){
                return index==0 || expect(respuestas[index]).to.eql(respuestas[0]);
            })){
                return respuestas[0];
            }else{
                console.log('Multiple diferencia en %s %s'.red,nombreFuncion,respuestas);
                throw new Error('Multiple diferencia en '+nombreFuncion);
            }
        }).catch(function(err){
            if(esto.cons.every(function(conexion,index){
                return index==0 || expect(errores[index]).to.eql(errores[0]);
            })){
                throw err;
            }else{
                console.log('Multiple diferencia en %s %s'.red,nombreFuncion,errores);
                throw new Error('Multiple diferencia en '+nombreFuncion);
            }
        });
    }
}

Sqlite.prototype.nombreMotor='sqlite3';
Mysql.prototype.nombreMotor='mysql';
Postgres.prototype.nombreMotor='pg';
Multiple.prototype.nombreMotor='multiple';

Sqlite.prototype.traducciones=[
    ['AUTO_INCREMENT UNIQUE','AUTOINCREMENT','ig'],
    ['\\bAUTO_INCREMENT\\b','AUTOINCREMENT','ig'],
    ['\\bTIMESTAMP\\b','DATETIME','ig'],
    ['(INSERT.*)RETURNING\\s+\\w+\\s+as\\s+ultimo_id','$1','ig'],
    ['\\bLIKE\\b','LIKE_NO_SOPORTADO','ig'],
    ['\\bILIKE\\b','LIKE','ig'],
    ['\\bTRUE\\b','(1=1)','ig'],
    ['\\bFALSE\\b','(1=2)','ig'],
];
Mysql.prototype.traducciones=[
    ['WITHOUT ROWID','','ig'],
    ['(INSERT.*)RETURNING\\s+\\w+\\s+as\\s+ultimo_id','$1','ig'],
    ['\\bLIKE\\b','LIKE_NO_SOPORTADO','ig'],
    ['\\bILIKE\\b','LIKE','ig'],
];
Postgres.prototype.traducciones=[
    ['INTEGER PRIMARY KEY AUTO_INCREMENT','SERIAL PRIMARY KEY','ig'],
    ['INTEGER AUTO_INCREMENT UNIQUE','SERIAL UNIQUE','ig'],
    ['\\bLIKE\\b','LIKE_NO_SOPORTADO','ig'],
    ['WITHOUT ROWID','','ig'],
];

BaseDeDatos.prototype.adaptarDriver=function(){
};

Postgres.prototype.adaptarDriver=function(){
    var INT8_OID=20;
    var NUMERIC_OID=1700;
    var MAX_INT_LEN=20;
    this.driver.types.setTypeParser(INT8_OID, function(val) {
        return val === null ? null : (val.length>MAX_INT_LEN ? val : parseInt(val));
    });
    this.driver.types.setTypeParser(NUMERIC_OID, function(val){
    /*
         console.log('**** NUMERIC'.green,val,Number(val),'12300'.replace(/^(\d+)(?:(.)(\d*[1-9])?0*)?$/,'$1$2$3'));
         console.log('**** NUMERIC'.green,val,Number(val),'12345'.replace(/^(\d+)(?:(.)(\d*[1-9])?0*)?$/,'$1$2$3'));
      console.log('**** NUMERIC'.green,val,Number(val),'12345.67'.replace(/^(\d+)(?:(.)(\d*[1-9])?0*)?$/,'$1$2$3'));
    console.log('**** NUMERIC'.green,val,Number(val),'12345.6700'.replace(/^(\d+)(?:(.)(\d*[1-9])?0*)?$/,'$1$2$3'));
    */
      //       console.log('**** NUMERIC'.green,val,Number(val),val.replace(/^(\d+)(?:(.)(\d*[1-9])?0*)?$/,'$1$2$3'));
        return val === null ? null : (Number(val).toString()==val.replace(/^(\d+)(?:(.)(\d*[1-9])?0*)?$/,'$1$2$3')?Number(val):val);
    });
};

Multiple.prototype.adaptarDriver=function(){
    // nada que hacer
}

Sqlite.prototype.abrirBase=function(definicion){
    this.db=new this.driver.Database(definicion);
    this.db.run("PRAGMA foreign_keys = ON;");
    this.db.run("PRAGMA recursive_triggers = ON;");
    this.db.run("PRAGMA reverse_unordered_selects = ON;"); // debería decir RANDOM, hay que poner siempre el ORDER BY
}
Mysql.prototype.abrirBase=function(definicion){
    this.db=this.driver.createConnection(definicion);
}
Postgres.prototype.abrirBase=function(definicion){
    this.db=new this.driver.Client(definicion);
    if(definicion){
        this.db.connect();
    }
}
Multiple.prototype.abrirBase=function(){
    // las bases múltiples deberían estar abiertas
}

BaseDeDatos.prototype.ejecutarViaPromesaOExcepcion=function(como,consulta){
    var esto=this;
    var nombreViejo=como.metodo;
    var resultViaThis=como.resultViaThis;
    if(this.log.todo[como.nombre]) console.log('db %s por %s',this.id,como.nombre,consulta);
    var parametros=como.sinConsulta?[]:this.armarSql.apply(this,consulta);
    return new Promise(function(resolve, reject){
        parametros.push(function(err,data){
            if(err){
                if(esto.log.error[como.nombre]) console.log('db %s %s','ERROR:'.yellow,esto.id,como.nombre,parametros,arguments);
                reject(err);
            }else{
                if(esto.log.todo[como.nombre]) console.log('db %s %s OK:',esto.id,como.nombre,parametros);
                if(!"LOG THIS") console.log('**** THIS db %s %s %s OK:'.magenta,esto.id,esto.motor,this);
                resolve(como.resultViaThis?this:data);
            }
        });
        esto.db[nombreViejo].apply(esto.db,parametros);
    });
}

BaseDeDatos.prototype.ejecutarViaPromesa=function(como,consulta){
    try{
        return this.ejecutarViaPromesaOExcepcion.apply(this,arguments);
    }catch(err){
        return Promise.reject(err);
    }
}

Sqlite.prototype.placeholder=function(nombre,posicion){
    return '$'+posicion;
}

Mysql.prototype.placeholder=function(nombre,posicion){
    return '?';
}

Postgres.prototype.casteo_parametros={
    string:'text',
    number:'numeric',
    'boolean':'boolean',
    'object':'object',
    'Date':'timestamp'
}

Postgres.prototype.placeholder=function(nombre,posicion,valor,prefijo){
    var rta='$'+posicion;
    if(prefijo){
        var tipo=this.casteo_parametros[typeof valor];
        if(tipo=='object'){
            tipo=valor?this.casteo_parametros[valor.constructor.name]:null;
        }
        if(tipo){
            rta+='::'+tipo;
        }
    }
    return rta;
}

BaseDeDatos.prototype.armarSql=function(sql,params){
    var esto=this;
    var valores=[];
    var parametros=arguments;
    var sql=sql.substr(sql.substr(0,1)=='\ufeff'?1:0);
    this.traducciones.forEach(function(reemplazos){
        sql=sql.replace(new RegExp(reemplazos[0],reemplazos[2]),reemplazos[1]);
    });
    var nuevoSql=sql.replace(/\?\?\?(\d+)([A-Z]+)(_\w+)?\b/ig,function(matches,cual,forma,prefijo){
        if(cual<1 || cual>=parametros.length){
            throw new Error('ERROR. armarSql. El placeholder ??? refiere a un numero de parametro que no esta');
        }
        var campos=Object.keys(parametros[cual]);
        return campos.map(function(campo,index){
            switch(forma){
            case 'CAMPOS':
                return campo;
            case 'PARAMS':
                var valor=parametros[cual][campo];
                valores.push(valor);
                return esto.placeholder(campo,Number(index)+1,valor,prefijo)+(prefijo?' as '+prefijo+campo:'');
            default:
                var cuantos=valores.push(parametros[cual][campo]);
                return campo+'=$'+cuantos;
            }
        }).join(forma=='AND'?' AND ':', ');
    });
    return [nuevoSql,valores];
}

var log_resultado=false;

BaseDeDatos.prototype.necesitaUltimoId=function(sentencia){
    return /returning.*ultimo_id/i.test(sentencia);
}

Sqlite.prototype.ejecutar=function(sql,parametros){
    var necesitaUi=this.necesitaUltimoId(sql);
    return this.ejecutarViaPromesa({nombre:'ejecutar', metodo:'run', resultViaThis:true},arguments).then(function(result){
        if(log_resultado) console.log('Resultado Sqlite'.blue,result,sql);
        return {cambios:result.changes||0, ultimo_id:!result.changes || !necesitaUi?null:result.lastID};
    });
}    

Mysql.prototype.ejecutar=function(sql,parametros){
    var necesitaUi=this.necesitaUltimoId(sql);
    return this.ejecutarViaPromesa({nombre:'ejecutar', metodo:'query'},arguments).then(function(result){
        if(log_resultado) console.log('Resultado Mysql'.blue,result,sql);
        return {cambios:result.affectedRows||0, ultimo_id:!result.affectedRows || !necesitaUi?null:result.insertId};
    });
    /* Otros parámetros:
        { fieldCount: 0,
          affectedRows: 1,
          insertId: 1,
          serverStatus: 2,
          warningCount: 0,
          message: '',
          protocol41: true,
          changedRows: 0 
        }
    */
}    

Postgres.prototype.ejecutar=function(sql,parametros){
    var necesitaUi=this.necesitaUltimoId(sql);
    return this.ejecutarViaPromesa({nombre:'ejecutar', metodo:'query'},arguments).then(function(result){
        if(log_resultado) console.log('Resultado Postgres'.blue,result,sql);
        return {cambios:result.rowCount||0, ultimo_id:!result.rowCount || !necesitaUi?null:(result.rows.length?result.rows[0].ultimo_id:null)};
    });
    /* Otros parámetros
        { command: 'INSERT',
          rowCount: 1,
          oid: 0,
          rows: [],
          fields: [],
          _parsers: [],
          RowCtor: null,
          rowAsArray: false 
        }
   */
}    

Multiple.registrarFuncionPrometedora('ejecutar');

Sqlite.prototype.todo=function(parametros){
    return this.ejecutarViaPromesa({nombre:'ejecutar', metodo:'all'},arguments);
}    

Mysql.prototype.todo=function(parametros){
    return this.ejecutarViaPromesa({nombre:'ejecutar', metodo:'query'},arguments);
}    

Postgres.prototype.todo=function(parametros){
    return this.ejecutarViaPromesa({nombre:'ejecutar', metodo:'query'},arguments).then(function(result){
        return result.rows;
    });
}    

Multiple.registrarFuncionPrometedora('todo');

Sqlite.prototype.fila=function(parametros){
    return this.ejecutarViaPromesa({nombre:'ejecutar', metodo:'get'},arguments);
};   

BaseDeDatos.prototype.fila=function(parametros,opciones){
    return this.todo(parametros,opciones).then(function(filas){
        if(!filas){
            if(opciones.aunqueNoHaya) return null;
            throw new Error('BaseDeDatos.fila sin fila');
        }
        return filas[0];
    });
};

Multiple.registrarFuncionPrometedora('fila');

BaseDeDatos.prototype.dato=function(parametros){
    return this.fila(parametros).then(function(fila){
        if(!fila){
            throw new Error('BaseDeDatos.dato sin fila');
        }
        for(var campo in fila){
            return fila[campo];
        }
    });
};   

Multiple.registrarFuncionPrometedora('dato');

Sqlite.prototype.cerrar=function(){
    return this.ejecutarViaPromesa({nombre:'cerrar', metodo:'close', sinConsulta:true});
};   

BaseDeDatos.prototype.cerrar=function(){
    return this.ejecutarViaPromesa({nombre:'cerrar', metodo:'end', sinConsulta:true});
};   

Postgres.prototype.cerrar=function(){
    this.db.end();
    return Promise.resolve();
};   

Multiple.registrarFuncionPrometedora('cerrar');

BaseDeDatos.prototype.insertar=function(tabla, campos_y_valores_o_solo_campos, valores_si_no_fueron_mandados_antes, opciones){
    var nombres_campos=(campos_y_valores_o_solo_campos instanceof Array?
        campos_y_valores_o_solo_campos:
        Object.keys(campos_y_valores_o_solo_campos)
    );
    if(campos_y_valores_o_solo_campos instanceof Array){
        var parametros={};
        nombres_campos.forEach(function(nombre,index){ 
            parametros[nombre]=valores_si_no_fueron_mandados_antes[index];
        });
    }else{
        var parametros=campos_y_valores_o_solo_campos;
        opciones=valores_si_no_fueron_mandados_antes;
    }
    for(var primer_campo in parametros){
        break;
    }
    if(!opciones){
        opciones={};
    }
    var sufijo_id=opciones.devolver_id?"  RETURNING "+(opciones.devolver_id===true?primer_campo:opciones.devolver_id)+" as ultimo_id":'';
    if(opciones.saltearPorCampos){
        var originales=parametros;
        var parametros={};
        for(var campo in originales){
            if(originales[campo]!==null && originales[campo]!==undefined){
                parametros[campo]=originales[campo];
            }
        }
        return this.ejecutar(
            "INSERT INTO "+tabla+" (???1CAMPOS) SELECT * FROM (SELECT ???1PARAMS__nue__) x "+
            "  WHERE NOT EXISTS (SELECT 1 FROM "+tabla+" WHERE "+
            opciones.saltearPorCampos.map(function(nombre_campo){
                return nombre_campo+' = __nue__'+nombre_campo;
            }).join(' AND ')+
            ")"+sufijo_id,
            parametros
        );
    }
    return this.ejecutar("INSERT INTO "+tabla+" (???1CAMPOS)  VALUES (???1PARAMS) "+sufijo_id,parametros);
}

Multiple.registrarFuncionPrometedora('insertar');

BaseDeDatos.prototype.ejecutarEnParalelo=function(sentencias){
    var db=this;
    var promesas=(sentencias||[]).map(function(sentencia){
        if(sentencia){
            if(typeof sentencia=='string' && sentencia.trim()){
                return db.ejecutar(sentencia);
            }else if(sentencia instanceof Function){
                return sentencia();
            }else{
                return Promise.resolve();
            }
        }else{
            return Promise.resolve();
        }
    });
    return Promise.all(promesas).then(function(dato){
        return dato;
    });
}
Multiple.prototype.ejecutarEnParalelo=BaseDeDatos.prototype.ejecutarEnParalelo;

BaseDeDatos.prototype.ejecutarSecuencialmenteLotesEnParalelo=function(lotes){
    var db=this;
    var cadenaPromesas=Promise.resolve();
    lotes.forEach(function(sentenciasParalelas){
        cadenaPromesas=cadenaPromesas.then(function(){
            return db.ejecutarEnParalelo(sentenciasParalelas);
        });
    });
    return cadenaPromesas;
}
Multiple.prototype.ejecutarSecuencialmenteLotesEnParalelo=BaseDeDatos.prototype.ejecutarSecuencialmenteLotesEnParalelo;

Object.defineProperty(BaseDeDatos.prototype,'abierto',{
    get: function(){
        return this.db.open;
    }
});

var fabrica={};

for(var motor in motores){
    fabrica[motores[motor].prototype.nombreMotor]=motores[motor];
    if(contexto.paraTest){
        publico[motor]=motores[motor];
    }
}

var nuevaConexion=publico.nuevaConexion=function(descripcion){
    var db=new (fabrica[descripcion.motor])(descripcion.connect||null);
    db.driver=drivers[descripcion.motor]=drivers[descripcion.motor]||require(descripcion.motor);
    db.motor=descripcion.motor;
    db.adaptarDriver();
    if(descripcion.connect){
        db.abrirBase(descripcion.connect);
    }
    return db;
}

return publico;

}