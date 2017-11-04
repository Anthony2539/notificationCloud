const functions = require('firebase-functions');
const _ = require('lodash');

// The Firebase Admin SDK to access the Firebase Realtime Database. 
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

exports.unReadNotification = functions.firestore.document('users/{userId}/notifications/{notificationId}').onWrite((event) => {

    const notificationId = event.params.notificationId; 
    const userId = event.params.userId;

    console.log("New notification("+notificationId+") for user "+userId);

    const userRef = admin.firestore().collection('users').doc(userId);

    // get all notification unread
    return userRef.collection('notifications').where("read","==",false).get().then(querySnapshot => {
        // get the total notification count
        const notificationCount = querySnapshot.size;
        console.log("Number of unread notification "+notificationCount);
       
        // data to update on the notification
        const data = {unread:notificationCount};
        
        // run update
        return userRef.update(data)
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
                saw:false,
                dateUpdate: new Date().getTime()
            }).then((notif) => {
                admin.firestore().collection('/users/'+userUid+'/notifications').where("saw", "=", false).get().then(function(querySnapshot) {      
                    console.log("Notification number unread  = "+querySnapshot.size); 
                    // Notification details.
                    const payload = {
                        notification: {
                        title: 'You have a new like!',
                        body: `${liker.displayName} like your spot.`,
                        sound: "default",
                        badge: querySnapshot.size.toString()
                        },
                        data:{  
                            likerUid: liker.uid,
                            spotUid: spotUid,
                            notificationUid: notif.id
                        }
                    };

                    const tokens = [];
                    tokens.push(user.token);
                    // Send notifications to all tokens.
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
    
                });
            })

        });
    }else{
        return console.log('There are no notification token to send to.');
    }
    
});