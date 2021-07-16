var express = require("express");
var session = require("express-session");
var app = express();
var bodyParser = require("body-parser");
var path = require("path");
var crypto = require("crypto");
var request = require("request"); //required for verify payment
const config = require("./config");

const async = require("async");
const MongoClient = require("mongodb").MongoClient;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: "mcg001k", saveUninitialized: true, resave: true }));
app.use(express.static(__dirname + "/"));
app.engine("html", require("ejs").renderFile);
app.set("view engine", "html");
app.set("views", __dirname);

const uri = config.production.mongodbURI;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
var key = config.production.key; // production key
var salt = config.production.salt; // production key

//Generate random txnid
app.get("/pay40", function (req, res) {
  var ord = JSON.stringify(Math.random() * 1000);
  var i = ord.indexOf(".");
  ord = "ORD" + ord.substr(0, i);
  res.render(__dirname + "/checkout1.html", { orderid: ord, key: key });
});

app.post("/pay40", function (req, res) {
  var strdat = "";

  req.on("data", function (chunk) {
    strdat += chunk;
  });

  req.on("end", function () {
    var data = JSON.parse(strdat);
    //generate hash with mandatory parameters and udf5
    var cryp = crypto.createHash("sha512");
    var text =
      key +
      "|" +
      data.txnid +
      "|" +
      data.amount +
      "|" +
      data.productinfo +
      "|" +
      data.firstname +
      "|" +
      data.email +
      "|||||" +
      data.udf5 +
      "||||||" +
      salt;
    // console.log("text", text);
    cryp.update(text);
    var hash = cryp.digest("hex");
    res.end(JSON.stringify(hash));
  });
});

app.post("/response.html", async function (req, res) {
  var verified = "No";
  var txnid = req.body.txnid;
  var amount = req.body.amount;
  var productinfo = req.body.productinfo;
  var firstname = req.body.firstname;
  var email = req.body.email;
  var udf5 = req.body.udf5;
  var mihpayid = req.body.mihpayid;
  var status = req.body.status;
  var resphash = req.body.hash;
  var txnDate = req.body.addedon;
  var mode = req.body.mode;
  var state = req.body.state;
  var additionalcharges = "";
  console.log("here is body", req.body);
  //Calculate response hash to verify
  var keyString =
    key +
    "|" +
    txnid +
    "|" +
    amount +
    "|" +
    productinfo +
    "|" +
    firstname +
    "|" +
    email +
    "|||||" +
    udf5 +
    "|||||";
  var keyArray = keyString.split("|");
  var reverseKeyArray = keyArray.reverse();
  var reverseKeyString = salt + "|" + status + "|" + reverseKeyArray.join("|");
  //check for presence of additionalcharges parameter in response.
  if (typeof req.body.additionalCharges !== "undefined") {
    additionalcharges = req.body.additionalCharges;
    //hash with additionalcharges
    reverseKeyString = additionalcharges + "|" + reverseKeyString;
  }
  //Generate Hash
  var cryp = crypto.createHash("sha512");
  cryp.update(reverseKeyString);
  var calchash = cryp.digest("hex");

  var msg =
    "Payment failed for Hash not verified...<br />Check Console Log for full response...";
  //Comapre status and hash. Hash verification is mandatory.
  if (calchash == resphash) {
    msg =
      "Transaction Successful and Hash Verified...<br />Check Console Log for full response...";
  }

  //Verify Payment routine to double check payment
  var command = "verify_payment";

  var hash_str = key + "|" + command + "|" + txnid + "|" + salt;
  var vcryp = crypto.createHash("sha512");
  vcryp.update(hash_str);
  var vhash = vcryp.digest("hex");

  var options = {
    method: "POST",
    uri: config.production.uri,
    form: {
      key: key,
      hash: vhash,
      var1: txnid,
      command: command,
    },
  };

  // if isTrue ture means his transection is successfully completed.
  let isTrue;

  await request(options, (error, res, body) => {
    if (error) {
      return console.error("upload failed:", error);
    }

    if (res.statusCode == 200) {
      return (isTrue = true);
    }
  });

  if (status === "success") {
    let str = resphash;
    const token = str.substring(0, 40);

    client.connect(async (err) => {
      const collection = client.db("paymentTokens").collection("devices");
      // perform actions on the collection object
      const isTxnExist = await collection.findOne({ TXNID: token });
      if (!isTxnExist) {
        await collection.insertOne({
          TXNID: token,
          emailTransactionID: txnid,
          TXNAMOUNT: amount,
          PAYMENTMODE: mode,
          TXNDATE: txnDate,
          QUESTIONS: 12,
        });
      }

      const collection2 = client.db("paymentTokens").collection("userDetails");
      const isEmailExist = await collection2.findOne({ email });
      console.log("is email", isEmailExist);
      if (!isEmailExist) {
        // perform actions on the collection object
        await collection2.insertOne({ name: firstname, email, state });
      }
    });

    setTimeout(() => {
      if (isTrue) {
        res.send(`<!DOCTYPE html>
        <html>
          <head>
            <link rel="stylesheet" href="payment_sucess.css" />
          </head>
          <body class="body">
            <h1>Payment Done</h1>
           <br />
            <h2><span style="color:grey;"> 1) Copy this code <br/> 2) Go back to Telegram Bot <br/> 3) Type <span style="color:black;"><b>/validate </b> </span> <br/> 4) Then paste this token. </span></h2>
        
            <form class = "">
             <input class = "form-control" type = "text" name = "amount" size = "50" value = ${token} readonly / >
            </div>
            </form>
            <br/><br/>
            <p> <b>Note: </b> Give space between /validate and token.
          </body>
        </html>`);
      } else {
        return res.send(`<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Document</title>
        </head>
        <body>
            <h1>Refresh (Reload) this page to get token.</h1>
        </body>
        </html>`);
      }
    }, 2000);
  } else {
    return res.send(`<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Document</title>
        </head>
        <body>
            <h1>Payment Failded !!!</h1>
        </body>
        </html>`);
  }
});

/******************************************************************************************************
 * 100 rupees page request
 */

//Generate random txnid
app.get("/pay100", function (req, res) {
  var ord = JSON.stringify(Math.random() * 1000);
  var i = ord.indexOf(".");
  ord = "ORD" + ord.substr(0, i);
  res.render(__dirname + "/checkout2.html", { orderid: ord, key: key });
});

app.post("/pay100", function (req, res) {
  var strdat = "";

  req.on("data", function (chunk) {
    strdat += chunk;
  });

  req.on("end", function () {
    var data = JSON.parse(strdat);
    //generate hash with mandatory parameters and udf5
    var cryp = crypto.createHash("sha512");
    var text =
      key +
      "|" +
      data.txnid +
      "|" +
      data.amount +
      "|" +
      data.productinfo +
      "|" +
      data.firstname +
      "|" +
      data.email +
      "|||||" +
      data.udf5 +
      "||||||" +
      salt;
    // console.log("text", text);
    cryp.update(text);
    var hash = cryp.digest("hex");
    res.end(JSON.stringify(hash));
  });
});

app.post("/response.html", async function (req, res) {
  var verified = "No";
  var txnid = req.body.txnid;
  var amount = req.body.amount;
  var productinfo = req.body.productinfo;
  var firstname = req.body.firstname;
  var email = req.body.email;
  var udf5 = req.body.udf5;
  var mihpayid = req.body.mihpayid;
  var status = req.body.status;
  var resphash = req.body.hash;
  var txnDate = req.body.addedon;
  var mode = req.body.mode;
  var state = req.body.state;
  var additionalcharges = "";
  console.log("here is body", req.body);

  //Calculate response hash to verify
  var keyString =
    key +
    "|" +
    txnid +
    "|" +
    amount +
    "|" +
    productinfo +
    "|" +
    firstname +
    "|" +
    email +
    "|||||" +
    udf5 +
    "|||||";
  var keyArray = keyString.split("|");
  var reverseKeyArray = keyArray.reverse();
  var reverseKeyString = salt + "|" + status + "|" + reverseKeyArray.join("|");
  //check for presence of additionalcharges parameter in response.
  if (typeof req.body.additionalCharges !== "undefined") {
    additionalcharges = req.body.additionalCharges;
    //hash with additionalcharges
    reverseKeyString = additionalcharges + "|" + reverseKeyString;
  }
  //Generate Hash
  var cryp = crypto.createHash("sha512");
  cryp.update(reverseKeyString);
  var calchash = cryp.digest("hex");

  var msg =
    "Payment failed for Hash not verified...<br />Check Console Log for full response...";
  //Comapre status and hash. Hash verification is mandatory.
  if (calchash == resphash) {
    msg =
      "Transaction Successful and Hash Verified...<br />Check Console Log for full response...";
  }

  //Verify Payment routine to double check payment
  var command = "verify_payment";

  var hash_str = key + "|" + command + "|" + txnid + "|" + salt;
  var vcryp = crypto.createHash("sha512");
  vcryp.update(hash_str);
  var vhash = vcryp.digest("hex");

  var options = {
    method: "POST",
    uri: config.production.uri,
    form: {
      key: key,
      hash: vhash,
      var1: txnid,
      command: command,
    },
  };

  // if isTrue ture means his transection is successfully completed.
  let isTrue;

  await request(options, (error, res, body) => {
    if (error) {
      return console.error("upload failed:", error);
    }

    if (res.statusCode == 200) {
      return (isTrue = true);
    }
  });

  if (status === "success") {
    let str = resphash;
    const token = str.substring(0, 40);

    client.connect(async (err) => {
      const collection = client.db("paymentTokens").collection("devices");
      // perform actions on the collection object
      const isTxnExist = await collection.findOne({ TXNID: token });
      if (!isTxnExist) {
        await collection.insertOne({
          TXNID: token,
          emailTransactionID: txnid,
          TXNAMOUNT: amount,
          PAYMENTMODE: mode,
          TXNDATE: txnDate,
          QUESTIONS: 30,
        });
      }

      const collection2 = client.db("paymentTokens").collection("userDetails");
      const isEmailExist = await collection2.findOne({ email });
      console.log("is email", isEmailExist);
      if (!isEmailExist) {
        // perform actions on the collection object
        await collection2.insertOne({ name: firstname, email, state });
      }
    });

    setTimeout(() => {
      if (isTrue) {
        res.send(`<!DOCTYPE html>
        <html>
          <head>
            <link rel="stylesheet" href="payment_sucess.css" />
          </head>
          <body class="body">
            <h1>Payment Done</h1>
           <br />
            <h2><span style="color:grey;"> 1) Copy this code <br/> 2) Go back to Telegram Bot <br/> 3) Type <span style="color:black;"><b>/validate </b> </span> <br/> 4) Then paste this token. </span></h2>
        
            <form class = "">
             <input class = "form-control" type = "text" name = "amount" size = "50" value = ${token} readonly / >
            </div>
            </form>
            <br/><br/>
            <p> <b>Note: </b> Give space between /validate and token.
          </body>
        </html>`);
      } else {
        return res.send(`<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Document</title>
        </head>
        <body>
            <h1>Refresh (Reload) this page to get token.</h1>
        </body>
        </html>`);
      }
    }, 2000);
  } else {
    return res.send(`<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Document</title>
        </head>
        <body>
            <h1>Payment Failded !!!</h1>
        </body>
        </html>`);
  }
});

app.listen(3000);
