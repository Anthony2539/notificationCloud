const functions = require('firebase-functions');
const _ = require('lodash');

// The Firebase Admin SDK to access the Firebase Realtime Database. 
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

exports.commentsNotification = functions.firestore.document('spots/{spotId}/comments/{commentId}').onCreate((event) => {

    const spotId = event.params.spotId;

    var newValue = event.data.data();
    const userUidComment = newValue.userUid;
    const userName = newValue.userName;
    const userPicture = newValue.userPicture;

    // ref to the parent document
    const docRef = admin.firestore().collection('spots').doc(spotId);
    docRef.get().then(function(querySnapshot) {
        const spot = querySnapshot.data();
        const userUid = spot.userUid;
 
        console.log('New commment of ', userUidComment , ' for userUid: ', userUid);
 
        admin.firestore().collection('/users/'+userUid+'/notifications').add({
         userLikerUid: userUidComment,
         userLikerName: userName,
         userLikerPhoto: userPicture,
         spotUid: spotId,
         read:false,
         type:"COMMENT",
         dateUpdate: new Date().getTime()
     }).then((notif) => {
         const userRef = admin.firestore().collection('users').doc(userUid);
         userRef.get().then(function(userSnapshot) {
             const user = userSnapshot.data();
             if(user.notificationNotSaw == undefined){
                 user.notificationNotSaw = 0; 
             }  
             const newNotificationNotSaw = user.notificationNotSaw + 1;
             console.log("Number of notification: "+user.notificationNotSaw+" => "+newNotificationNotSaw);
             // Notification details.
             const payload = {
                 notification: {
                 title: 'Vous avez un nouveau commentaire',
                 body: `${userName} à commenté votre spot`,
                 sound: "default",
                 badge: newNotificationNotSaw.toString()
                 },
                 data:{  
                     likerUid: userUidComment,
                     spotUid: spotId,
                     notificationUid: notif.id
                 }
             };
 
             const data = {notificationNotSaw:newNotificationNotSaw};
             userRef.update(data);
 
             const tokens = [];
             tokens.push(user.token);
             // Send notifications to all tokens.
             if(user.receiveNotif || user.receiveNotif === undefined){
                return admin.messaging().sendToDevice(tokens, payload).then(response => {
                // For each message check if there was an error.
                const tokensToRemove = [];
                response.results.forEach((result, index) => {
                    const error = result.error;
                    if (error) {
                    console.error('Failure sending notification to', tokens[index], error);
                    // Cleanup the tokens who are not registered anymore.
                    if (error.code === 'messaging/invalid-registration-token' ||
                        error.code === 'messaging/registration-token-not-registered') {
                        tokensToRemove.push(tokensSnapshot.ref.child(tokens[index]).remove());
                    }
                    }else{
                        console.log("Notification sended");
                    }
                });
                return Promise.all(tokensToRemove);
                });
            }
 
         });
     });

    });

});

exports.commentsCount = functions.firestore.document('spots/{spotId}/comments/{commentId}').onWrite((event) => {
    const commentId = event.params.commentId; 
    const spotId = event.params.spotId;

    const docRef = admin.firestore().collection('spots').doc(spotId);
    // get all comments and aggregate
    return docRef.collection('comments').orderBy('createdAt', 'desc')
    .get()
    .then(querySnapshot => {
       // get the total comment count
       const commentCount = querySnapshot.size
    
       // data to update on the document
       const data = { commentCount:commentCount }
       
       // run update
       return docRef.update(data)
    })
    .catch(err => console.log(err) )
});

exports.likesNotification = functions.firestore.document('spots/{spotId}').onUpdate((event) => {


    var newValue = event.data.data();
    var previousValue = event.data.previous.data();
    var spotUid = newValue.id;

    const userUid = newValue.userUid;

    if(!previousValue.likes){
        previousValue.likes = []; 
    }

    console.log('Previsous like length: ', previousValue.likes.length , 'New like length:', newValue.likes.length, ' For spotUid: ', spotUid);

    if(previousValue.likes.length < newValue.likes.length){
        const userLikerUid = _.last(newValue.likes);
        if(!userLikerUid){
            return console.log("We don't have a new notification");
        }
        console.log('We have a new like UID:', userLikerUid, 'for user:', userUid);

        // Get the list of device notification tokens.
        var getDeviceTokensPromise = admin.firestore().doc(`/users/${userUid}`).get();

        // Get the liker profile.
        const getFollowerProfilePromise = admin.auth().getUser(userLikerUid);

        return Promise.all([getDeviceTokensPromise,getFollowerProfilePromise]).then(results => {

            const tokensSnapshot = results[0];
            const liker = results[1];

            const user = tokensSnapshot.data();

            console.log("Token "+ user.token);
            console.log('Fetched liker profile', liker);

            if (!user.token) {
                return console.log('There are no notification token to send to.');
              }

            admin.firestore().collection('/users/'+userUid+'/notifications').add({
                userLikerUid: userLikerUid,
                userLikerName: liker.displayName,
                userLikerPhoto: liker.photoURL,
                spotUid: spotUid,
                read:false,
                type:"LIKE",
                dateUpdate: new Date().getTime()
            }).then((notif) => {
                const userRef = admin.firestore().collection('users').doc(userUid);
                userRef.get().then(function(userSnapshot) {
                    const user = userSnapshot.data();
                    if(user.notificationNotSaw == undefined){
                        user.notificationNotSaw = 0; 
                    }  
                    const newNotificationNotSaw = user.notificationNotSaw + 1;
                    console.log("Number of notification: "+user.notificationNotSaw+" => "+newNotificationNotSaw);
                    // Notification details.
                    const payload = {
                        notification: {
                        title: 'Vous avez un nouveau like',
                        body: `${liker.displayName} à aimé votre spot`,
                        sound: "default",
                        badge: newNotificationNotSaw.toString()
                        },
                        data:{  
                            likerUid: liker.uid,
                            spotUid: spotUid,
                            notificationUid: notif.id
                        }
                    };

                    const data = {notificationNotSaw:newNotificationNotSaw};
                    userRef.update(data);

                    const tokens = [];
                    tokens.push(user.token);
                    // Send notifications to all tokens.
                    if(user.receiveNotif || user.receiveNotif === undefined){
                        return admin.messaging().sendToDevice(tokens, payload).then(response => {
                        // For each message check if there was an error.
                        const tokensToRemove = [];
                        response.results.forEach((result, index) => {
                            const error = result.error;
                            if (error) {
                            console.error('Failure sending notification to', tokens[index], error);
                            // Cleanup the tokens who are not registered anymore.
                            if (error.code === 'messaging/invalid-registration-token' ||
                                error.code === 'messaging/registration-token-not-registered') {
                                tokensToRemove.push(tokensSnapshot.ref.child(tokens[index]).remove());
                            }
                            }else{
                                console.log("Notification sended");
                            }
                        });
                        return Promise.all(tokensToRemove);
                        });
                    }
    
                });
            });

        });
    }else{
        return console.log('There are no notification token to send to.');
    }
    
});