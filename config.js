module.exports = Object.freeze({
    production: {
        uri : "https://info.payu.in/merchant/postservice.php?form=1",
        key: "0j7zny",
        salt: "0bEORCg1",
        action: "https://secure.payu.in/_payment",
        mongodbURI: "mongodb+srv://kunal:MyPassword@newcluster.xiphf.mongodb.net/myFirstDatabase?retryWrites=true&w=majority",
    },
    staging: {
        uri : "https://test.payu.in/merchant/postservice.php?form=2",
        key: "oZ7oo9",
        salt: "UkojH5TS",
        action: "https://test.payu.in/_payment"
    }
})