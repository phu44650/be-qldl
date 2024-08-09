import db from "../models/index";
import bcrypt from "bcryptjs";
require("dotenv").config();
import emailService from "./emailService";
import { v4 as uuidv4 } from "uuid";
var fs = require('fs');
const clientHttps = require('https');
require("dotenv").config();
const { Op } = require("sequelize");

const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
const googleAuth = async (token) => {
  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  const { sub, email, name, picture } = payload;
  const userId = sub;
  return { userId, email, fullname: name, photoUrl: picture };
}

const salt = bcrypt.genSaltSync(10);

// function to encode file data to base64 encoded string
let base64_encode = (file) => {
  // read binary data
  var bitmap = fs.readFileSync(file);
  // convert binary data to base64 encoded string
  return new Buffer(bitmap).toString('base64');
}


let handleUserLogin = (email, password) => {
  return new Promise(async (resolve, reject) => {
    try {
      let userData = {};
      let isExist = await checkUserEmail(email);
      if (isExist) {
        let user = await db.User.findOne({
          where: { email: email },
          attributes: [
            "id",
            "email",
            "roleId",
            "password",
            "firstName",
            "lastName",
            "image",
            "address",
            "gender",
            "phonenumber",
            "status"
          ],
          include: [
            {
              model: db.Doctor_Infor,
              attributes: ["priceId", "specialtyId"],
              include: [
                {
                  model: db.Allcode,
                  as: "priceTypeData",
                  attributes: ["valueEn", "valueVi"],
                },
              ],
            },
          ],
          raw: true,
          nest: true,
        });
        if (user) {
          //compare password
          let check = await bcrypt.compareSync(password, user.password);
          if (check) {
            userData.errCode = 0;
            userData.errMessage = "OK";
            delete user.password;
            userData.user = user;
          } else {
            userData.errCode = 3;
            userData.errMessage = "wrong password";
          }

          //check status
          if (user && user.status && user.status !== 0) {
            userData.errCode = 1;
            userData.errMessage = `Status is not active`;
          }
        } else {
          userData.errCode = 2;
          userData.errMessage = `User's not found`;
        }
      } else {
        userData.errCode = 1;
        userData.errMessage = `Your's Email isn't exist in your system. Plz try other email`;
      }

      resolve(userData);
    } catch (e) {
      reject(e);
    }
  });
};

let checkUserEmail = (userEmail) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user = await db.User.findOne({
        where: { email: userEmail },
      });
      if (user) {
        resolve(true);
      } else {
        resolve(false);
      }
    } catch (e) {
      reject(e);
    }
  });
};

let getAllUsers = (userId) => {
  return new Promise(async (resolve, reject) => {
    try {
      let users = "";
      if (userId === "ALL") {
        users = await db.User.findAll({
          attributes: {
            exclude: ["password"],
          },
        });
      }
      if (userId && userId !== "ALL") {
        users = await db.User.findOne({
          where: { id: userId },
          attributes: {
            exclude: ["password"],
          },
        });
      }
      resolve(users);
    } catch (e) {
      reject(e);
    }
  });
};

let createNewUser = async (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      //check email is exist
      let check = await checkUserEmail(data.email);
      if (check === true) {
        resolve({
          errCode: 1,
          errMessage: "Your email is already in used, plz try another email!!",
        });
      } else {
        let hashPasswordFromBcrypt = await hashUserPassword(data.password);

        //luong 1 de admin tao nguoi dung
        if (data.roleId === 'R1' || data.roleId === 'R2') {
          await db.User.create({
            email: data.email,
            password: hashPasswordFromBcrypt,
            firstName: data.firstName,
            lastName: data.lastName,
            address: data.address,
            phonenumber: data.phonenumber,
            gender: data.gender,
            roleId: data.roleId,
            positionId: data.positionId,
            image: data.avatar,
            status: data.status ? data.status : 0
          });
          resolve({
            errCode: 0,
            message: "ok",
          });
        } else {
          //luong 2 de guest tao tai khoan benh nhan
          await db.User.create({
            email: data.email,
            password: hashPasswordFromBcrypt,
            firstName: data.firstName,
            lastName: data.lastName,
            address: data.address,
            phonenumber: data.phonenumber,
            gender: data.gender,
            roleId: 'R3',

            image: data.avatar,
            status: data.status ? data.status : 0
          });
          resolve({
            errCode: 0,
            message: "ok",
          });
        }

      }
    } catch (e) {
      reject(e);
    }
  });
};

let hashUserPassword = (password) => {
  return new Promise(async (resolve, reject) => {
    try {
      let hashPassword = await bcrypt.hashSync(password, salt);
      resolve(hashPassword);
    } catch (e) {
      reject(e);
    }
  });
};

let deleteUser = (userId) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user = await db.User.findOne({
        where: { id: userId },
      });
      if (!user) {
        resolve({
          errCode: 2,
          errMessage: `The user isn't exist`,
        });
      }
      if (user) {
        let newUser = await db.restore_users.create({
          idUser: user.id,
          email: user.email,
          password: user.password,
          firstName: user.firstName,
          lastName: user.lastName,
          address: user.address,
          phonenumber: user.phonenumber,
          gender: user.gender,
          roleId: user.roleId,
          positionId: user.positionId,
          image: user.image,
          status: user.status
        });

        if (newUser) {
          await db.User.destroy({
            where: { id: userId },
          });
        }
      }
      resolve({
        errCode: 0,
        errMessage: `The user is deleted`,
      });
    } catch (e) {
      reject(e);
    }
  });
};

let udateUserData = (data) => {

  return new Promise(async (resolve, reject) => {
    try {
      if (!data.id) {
        resolve({
          errCode: 2,
          errMessage: "Missing required parameter",
        });
      }

      let user = await db.User.findOne({
        where: { id: data.id },
        raw: false, //chu y cho nay do ben file config cau hinh cho query
      });
      if (user) {
        user.firstName = data.firstName;
        user.lastName = data.lastName;
        user.address = data.address;
        if (data.roleId) user.roleId = data.roleId;
        if (data.positionId) user.positionId = data.positionId;
        user.gender = data.gender;
        user.phonenumber = data.phonenumber;
        // if (data.avatar && data.avatar.data) {
        //   // Chuyển đối tượng Buffer thành chuỗi
        //   user.image = data.avatar.data.toString('base64');
        // }//da chuyen thanh chuoi roi o client roi nen k can chuyen nua
        user.status = data.status;
        // user.image = data.avatar;
        if (typeof data.avatar === 'string') {
          //truong hop ma du lieu da image da dua len client ,nhung lai k thay doi image ma dua xuong lai
          user.image = data.avatar;
        } else {
          //truong hop dua file moi xuong ->chuyen base->nhi phan->db
          user.image = new Buffer(data.avatar.data, "base64").toString("binary");
        }

        await user.save();

        resolve({
          errCode: 0,
          message: "Update the user succeed!",
        });
      } else {
        reject({
          errCode: 1,
          errMessage: `User's not found!`,
        });
      }
    } catch (e) {
      console.error('Lỗi xảy ra:', e);
      reject(e);
    }
  });
};

let getAllCodeService = (typeInput) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!typeInput) {
        resolve({
          errCode: 1,
          errMessage: "Missing required parameters",
        });
      } else {
        let res = {};
        let allcode = await db.Allcode.findAll({
          where: { type: typeInput },
        });
        res.errCode = 0;
        res.data = allcode;
        resolve(res);
      }
    } catch (e) {
      reject(e);
    }
  });
};



let buildUrlEmailConfirmation = (tokenUser, email) => {
  //link hoi phuc gmail-chuyen den trang  hoi phuc gamil neu an xac nhan trong email
  let result = `${process.env.URL_REACT}/verify-acc?tokenUser=${tokenUser}&email=${email}`;

  return result;
};


// let registerUserService = async (data) => {
//   try {
//     if (!data.email || !data.password) {
//       return {
//         errCode: 1,
//         errMessage: "Thiếu tham số bắt buộc",
//       };
//     }

//     // Kiểm tra xem email đã đăng ký chưa
//     let existingUser = await db.User.findOne({
//       where: { email: data.email },
//       raw: false,
//     });

//     if (existingUser) {
//       return {
//         errCode: 1,
//         errMessage: "Người dùng với địa chỉ email này đã tồn tại",
//       };
//     }

//     // Tạo một người dùng mới
//     let newUser = await db.User.create({
//       email: data.email,
//       password: data.password,
//     });

//     // Tạo mã token duy nhất để xác nhận email
//     let tokenUser = uuidv4();
//     let expirationTime = new Date();
//     expirationTime.setSeconds(expirationTime.getSeconds() + 30); // Hết hạn sau 30 giây

//     // Cập nhật thông tin xác nhận trong người dùng
//     newUser.tokenUser = tokenUser;
//     newUser.confirmationExpiration = expirationTime;
//     await newUser.save();

//     // Gửi email xác nhận
//     await emailService.sendConfirmationEmail({
//       receiverEmail: data.email,
//       redirectLink: buildUrlEmailConfirmation(tokenUser, data.email),
//     });

//     return {
//       errCode: 0,
//       message: "Đăng ký người dùng thành công. Vui lòng kiểm tra email để xác nhận.",
//     };
//   } catch (e) {
//     return {
//       errCode: 1,
//       errMessage: "Đã xảy ra lỗi trong quá trình đăng ký",
//     };
//   }
// };

// // Hàm xử lý xác nhận mã token
// let confirmUserRegistration = async (data) => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       let user = await db.User.findOne({
//         where: { email: data.email, confirmationToken: data.confirmationToken },
//         raw: false,
//       });

//       if (user && user.confirmationExpiration > new Date()) {
//         // Token hợp lệ, xác nhận người dùng
//         user.confirmed = true;
//         await user.save();

//         // Xóa token sau khi xác nhận
//         user.confirmationToken = null;
//         user.confirmationExpiration = null;
//         await user.save();

//         resolve({
//           errCode: 0,
//           message: "Xác nhận người dùng thành công",
//         });
//       } else {
//         // Token đã hết hạn hoặc không hợp lệ
//         resolve({
//           errCode: 1,
//           errMessage: "Mã xác nhận không hợp lệ hoặc đã hết hạn",
//         });
//       }
//     } catch (e) {
//       reject(e);
//     }
//   });
// };



let buildUrlEmailForgotPassword = (tokenUser, email) => {
  //link hoi phuc gmail-chuyen den trang  hoi phuc gamil neu an xac nhan trong email
  let result = `${process.env.URL_REACT}/retrieve-password?tokenUser=${tokenUser}&email=${email}`;

  return result;
};

//quen mk
let postForgotPasswordService = (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!data.email) {
        resolve({
          errCode: 1,
          errMessage: "Missing required parameter",
        });
      } else {
        let tokenUser = uuidv4(); // ⇨ '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' -random
        await emailService.sendForgotPasswordEmail({
          //truyen nhung cai nay cho email de gui di
          receiverEmail: data.email,
          //
          redirectLink: buildUrlEmailForgotPassword(tokenUser, data.email),
        });

        //find user have in table Users-if have update tokenUser
        let user = await db.User.findOne({
          where: { email: data.email },
          raw: false,
        });
        if (user) {
          //neu co user thi se tao token gui xuong db
          user.tokenUser = tokenUser;
          await user.save();

          resolve({
            errCode: 0,
            message: "Update the user and send Forgot Password email succeed!",
          });
        } else {
          resolve({
            errCode: 1,
            errMessage: `User's not found!`,
          });
        }
      }
    } catch (e) {
      reject(e);
    }
  });
};


//bam vao link da gui o email->so sanh token dc gui vs token  o db->giong nhau thi xac nhan doi mk va xoa cai token
let postVerifyRetrievePasswordService = async (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!data.tokenUser || !data.email || !data.newPassword) {
        resolve({
          errCode: 1,
          errMessage: "Missing required parameter",
        });
      } else {
        let hashPasswordFromBcrypt = await hashUserPassword(data.newPassword);

        //find user have in table Users-if have update tokenUser
        let user = await db.User.findOne({
          where: { email: data.email, tokenUser: data.tokenUser },
          raw: false,
        });
        if (user) {
          //khi da xac nhan dung toekn thi se xoa token cu -> chuyen thanh null
          user.password = hashPasswordFromBcrypt;
          user.tokenUser = null;
          await user.save();

          resolve({
            errCode: 0,
            message: "Change user password succeed!",
          });
        } else {
          resolve({
            errCode: 2,
            errMessage: `User's not found!`,
          });
        }
      }
    } catch (e) {
      reject(e);
    }
  });
};

//download img from url
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    clientHttps.get(url, (res) => {
      if (res.statusCode === 200) {
        res.pipe(fs.createWriteStream(filepath))
          .on('error', reject)
          .once('close', () => resolve(filepath));
      } else {
        // Consume response data to free up memory
        res.resume();
        reject(new Error(`Request Failed With a Status Code: ${res.statusCode}`));

      }
    });
  });
}

let handleLoginGoogle = (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      let userData = {};

      let googleUser = await googleAuth(data.tokenId)

      //   downloadImage(googleUser.photoUrl, './src/public/google.png')
      // .then(console.log)
      // .catch(console.error);

      // let avatar = base64_encode('./src/public/google.png')


      let user = await db.User.findOrCreate({
        where: { email: googleUser.email },
        defaults: {
          email: googleUser.email,
          roleId: "R3",
          firstName: googleUser.fullname,
          // image: avatar
        },
      });

      let currentUser;
      if (user) {
        currentUser = await db.User.findOne({
          where: { email: user[0].email },
          attributes: [
            "id",
            "email",
            "roleId",
            "password",
            "firstName",
            "lastName",
            "image",
            "address",
            "gender",
            "phonenumber"
          ],
          include: [
            {
              model: db.Doctor_Infor,
              attributes: ["priceId", "specialtyId"],
              include: [
                {
                  model: db.Allcode,
                  as: "priceTypeData",
                  attributes: ["valueEn", "valueVi"],
                },
              ],
            },
          ],
          raw: true,
          nest: true,
        });
      }

      if (currentUser) {
        userData.errCode = 0;
        userData.errMessage = "OK";
        delete currentUser.password;
        userData.user = currentUser;
      }

      resolve(
        userData
      );
    } catch (e) {
      reject(e);
    }
  });
};

let filterUsers = (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      let options = {
        where: {},
        raw: true,
        nest: true,
      };
      let firstName = data.firstName;
      let lastName = data.lastName;
      let email = data.email;
      let role = data.role;
      let address = data.address;
      let position = data.position;
      let gender = data.gender;

      if (firstName) {
        options.where.firstName = {
          [Op.like]: '%' + firstName + '%'
        }
      }
      if (lastName) {
        options.where.lastName = {
          [Op.like]: '%' + lastName + '%'
        }
      }
      if (email) {
        options.where.email = {
          [Op.like]: '%' + email + '%'
        }
      }
      if (role) options.where.roleId = role
      if (address) {
        options.where.address = {
          [Op.like]: '%' + address + '%'
        }
      }
      if (position) options.where.positionId = position
      if (gender) options.where.gender = gender
      //get alll ủe
      let dataUsers = []
      dataUsers = await db.User.findAll(options)
      resolve({
        errCode: 0,
        data: dataUsers,
      });

    } catch (e) {
      reject(e);
    }
  });
};

let handleEditPassword = (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!data.id) {
        resolve({
          errCode: 1,
          errMessage: "Missing required parameter",
        });
      } else {

        let user = await db.User.findOne({
          where: { id: data.id },
          raw: false,
        });
        if (user) {
          //compare password
          let check = await bcrypt.compareSync(data.currentPassword, user.password);

          if (check) {
            let hashPasswordFromBcrypt = await hashUserPassword(data.newPassword);
            user.password = hashPasswordFromBcrypt;
            await user.save();
            resolve({
              errCode: 0,
              message: "Update password success!",
            });
          } else {
            resolve({
              errCode: 1,
              message: "wrong password!",
            });
          }
        } else {
          resolve({
            errCode: 1,
            errMessage: `User's not found!`,
          });
        }
      }
    } catch (e) {
      reject(e);
    }
  });
};


let filterRestoreUsers = (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      let options = {
        where: {},
        raw: true,
        nest: true,
      };
      let firstName = data.firstName;
      let lastName = data.lastName;
      let email = data.email;
      let role = data.role;
      let address = data.address;
      let position = data.position;
      let gender = data.gender;

      if (firstName) {
        options.where.firstName = {
          [Op.like]: '%' + firstName + '%'
        }
      }
      if (lastName) {
        options.where.lastName = {
          [Op.like]: '%' + lastName + '%'
        }
      }
      if (email) {
        options.where.email = {
          [Op.like]: '%' + email + '%'
        }
      }
      if (role) options.where.roleId = role
      if (address) {
        options.where.address = {
          [Op.like]: '%' + address + '%'
        }
      }
      if (position) options.where.positionId = position
      if (gender) options.where.gender = gender

      let dataUsers = []
      dataUsers = await db.restore_users.findAll(options)
      resolve({
        errCode: 0,
        data: dataUsers,
      });

    } catch (e) {
      reject(e);
    }
  });
};

let handleRestoreUser = (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user = await db.restore_users.findOne({
        where: { email: data.email },
      });
      if (user) {
        let newUser = await db.User.create({
          id: user.idUser,
          email: user.email,
          password: user.password,
          firstName: user.firstName,
          lastName: user.lastName,
          address: user.address,
          phonenumber: user.phonenumber,
          gender: user.gender,
          roleId: user.roleId,
          positionId: user.positionId,
          image: user.image,
          status: user.status
        });

        if (newUser) {
          await db.restore_users.destroy({
            where: { email: user.email },
          });
        }
      }
      resolve({
        errCode: 0,
        message: "Restore user successfully!"
      });

    } catch (e) {
      reject(e);
    }
  });
};

let deleteRestoreUser = (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user = await db.restore_users.findOne({
        where: { email: data.email },
      });
      if (!user) {
        resolve({
          errCode: 2,
          errMessage: `The user isn't exist`,
        });
      }
      if (user) {
        await db.restore_users.destroy({
          where: { email: data.email },
        });
      }
      resolve({
        errCode: 0,
        errMessage: `The user is permanently deleted `,
      });
    } catch (e) {
      reject(e);
    }
  });
};




module.exports = {
  handleUserLogin: handleUserLogin,
  getAllUsers: getAllUsers,
  createNewUser: createNewUser,
  deleteUser: deleteUser,
  udateUserData: udateUserData,
  getAllCodeService: getAllCodeService,
  postForgotPasswordService: postForgotPasswordService,
  postVerifyRetrievePasswordService: postVerifyRetrievePasswordService,
  handleLoginGoogle: handleLoginGoogle,
  filterUsers: filterUsers,
  handleEditPassword: handleEditPassword,
  filterRestoreUsers: filterRestoreUsers,
  handleRestoreUser: handleRestoreUser,
  deleteRestoreUser: deleteRestoreUser
  // , registerUserService
};
