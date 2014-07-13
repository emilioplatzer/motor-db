motor-db
========

Motor de base de datos no neutral para NodeJS. Inicialmente con postgresql, sqlite y mysql. 

El objetivo es poder usar un solo juego de librerías donde se escribe el mismo SQL para todas las bases. 

El funcionamiento es siempre asincrónico basado en **Promise** <https://www.npmjs.org/package/promise-es6>

Install
=======

    $ npm install motor-db
    
Uso
===

    var motorDb = require('motor-db');
    
    var db=motorDb.nuevaConexion({
        motor:'pg', // postgresql
        connect:{
            host: "localhost",
            database: "para_prueba_db",
            user: "the_user_name",
            password: "the_pass"
        }
    });

    db.ejecutar("DROP TABLE IF EXISTS prueba;").then(function(){
        return db.ejecutar("CREATE TABLE prueba (texto VARCHAR(10), num INTEGER);");
    }).then(function(){
        return db.insertar("prueba", {texto:'este', num:7});
    }).then(function(resultado){
        console.log('se insertaron correctamente %d fila(s)',resultado.cambios);
        return db.fila("SELECT * FROM prueba LIMIT 1");
    }).then(function(fila){
        console.log('datos devueltos: %s %d', fila.texto, fila.num);
    }).catch(function(err){
        console.log('Hubo un error en el ejemplo',err);
        throw err;
    });

Manual
======

motorDb.nuevaConexion(opciones);
--------------------------------

Conecta y abre una base de datos PostgreSQL, sqlite3 o MySQL. 

**Devuelve** una conexión a la base de datos. 

Híbridamente asincrónico (o sea no detiene la ejecución pero no tiene función callback ni devuelve una promesa,
la conexión estará lista cuando se ejecute la primera acción sobre la conexión). 

opciones:
* motor (nombre del motor: `'pg'`, `'sqlite'` o `'mysql'`)
* connect (string connect que será pasado a la librería de base de datos, en el caso de sqlite3 es un string, 
en los otros casos es un objeto con los siguientes campos: host, database, user, password).

conexion.ejecutar(sql,\[parametros... \]);
--------------------------------

Ejecuta una instrucción SQL que no devuelve datos (INSERT, DELETE, UPDATE, CREATE, ALTER, etc). 

**Devuelve una promesa** que entrega un objeto `{cambios:x, ultimo_id:y}` 
con la cuenta de la cantidad de cambios que hubo (ej: cantidad de registros eliminados)
y el último ID insertado (en el caso de insertar un único registro en una tabla con clave autonumérica). 

Los parametros son uno o más objetos con los parámetros de la consulta. 
A diferencia de los placeholders típicos de los drivers comunes de base de datos acá los parámetros pueden 
referenciarse en forma global. 

Dada la siguiente llamada a ejecutar

    con.ejecutar(sql,{par1:1, par2:'dos', par3:true}, {otro:new Date(2012,1,13)});
    
se creará una llamada a la base donde el string sql recibido como parámetro será completado con nombres de
campos y placeholders en forma global. Todos los reemplazadores son de la forma `???`**ALGO**#\_\_**pref**\_\_, 
siempre empiezan con los tres signos de pregunta, luego **ALGO** puede ser la palabra `CAMPOS`, `PARAMS` o `AND`,
# es un número indicando a cuál grupo de parámetros se refiere 
y **pref** es el prefijo a colocar si se necesita un alias

Ejemplos:
* `???CAMPOS1` es reemplazado por `par1, par2, par3`
* `???CAMPOS2` es reemplazado por `otro`
* `???PARAMS1` es reemplazado por `?, ?, ?` o `:par1, :par2, :par3` o la forma que tenga el driver de poner los placeholders
* `???PARAMS2__pref__` es reemplazado por `? as pref_otro` o `:otro as pref_otro` según el driver
* `???AND1` es reemplazado por `par1=? AND par2=? AND par3=?`

Además de hacer los reemplazos en el SQL se preparará el arreglo u objeto que se pasará como parámetro al driver 
de modo de pasar siempre separados la sentencia y los datos. 

conexion.dato(sql,\[parametros... \]);
--------------------------------

Ejecuta una consulta que se espera que devuelva una única fila con un único valor (única columna). 

**Devuelve una promesa** que entrega un valor. 

Recibe el sql y los parámetros con el mismo formato que `ejecutar`.

conexion.fila(sql,\[parametros... \]);
--------------------------------

Ejecuta una consulta que se espera que devuelva una única fila

**Devuelve una promesa** que entrega un objeto asociativo con la fila devuelta. 

Recibe el sql y los parámetros con el mismo formato que `ejecutar`.

conexion.todo(sql,\[parametros... \]);
--------------------------------

Ejecuta una consulta que puede devolver cero o más filas

**Devuelve una promesa** que entrega un arreglo de filas. Cada fila es un objeto asociativo. 

Recibe el sql y los parámetros con el mismo formato que `ejecutar`.

conexion.insertar(nombre_tabla,\[parametros... \]);
--------------------------------

Arma y ejecuta una consulta de inserción sobre la tabla nombre_tabla

**Devuelve una promesa** que entrega un objeto un objeto `{cambios:x, ultimo_id:y}` (según lo que se describe en `ejecutar`). 

Esta función no recibe un SQL, lo arma así:

    conexion.insertar('la_tabla', {campo1: 1, campo2: 'a'});
    
equivale a:

    conexion.ejecutar('INSERT INTO la_tabla (???CAMPOS1) VALUES (???PARAMS1)', {campo1: 1, campo2: 'a'});
    
que a su vez equivale a una llamada al driver nativo a algo parecido a:

    driver.run('INSERT INTO la_tabla (campo1, campo2) VALUES (?, ?)', [1, 'a']);

conexion.cerar();
--------------------------------

Cierra la conexión con la base de datos

    
Running tests
=============

Las pruebas se basan en [mocha](http://visionmedia.github.io/mocha/)

    $ npm install
    $ npm test
