const express = require('express');
const cron = require('node-cron');
const fs = require('fs');
const moment = require('moment');
const cmd = require('node-cmd');
const archiver = require('archiver');
const AWS = require('aws-sdk');

require('dotenv').config();

const app = express();

/**
global variables
 */
let dir;
let timeAndDate = '';
let zipDir = '';
const rootDir = '../Database_Backups';
let zipFile = '';
let ndir;

const databaseDetails = [
	{
		mongoSRV: process.env.JharUP_MONGO_URI,
		folderName: 'JharkhandUpdate',
		ec2URL: 'x',
		S3ACCESSKEY: process.env.JHARUP_SECRETACCESSKEY,
		S3ACCESSID: process.env.JHARUP_ACCESSKEYID,
		BUCKET: process.env.JHARUP_S3BUCKET,
	},
];

/**
 *
 * @param {string} file : Path of the file
 * @param {object} parameters
 * @returns Promise
 */

const uploadOnS3 = (file, parameters) => {
	return new Promise((resolve) => {
		const s3 = new AWS.S3({
			accessKeyId: parameters.S3ACCESSID,
			secretAccessKey: parameters.S3ACCESSKEY,
		});

		var base64Data = fs.readFileSync(file);

		const params = {
			Bucket: parameters.BUCKET,
			Key: parameters.KEY,
			Body: base64Data,
			ACL: 'public-read',
			ContentType: 'application/zip',
		};

		s3.upload(params, (err, datas) => {
			if (err) {
				return console.log(err);
			}
			resolve(datas);
		});
	});
};

/**
 *
 * @param {string} source : path of the folder that you want to create a zip
 * @param {string} out : name of the zip
 * @returns
 */

function zipDirectory(source, out) {
	const archive = archiver('zip', { zlib: { level: 9 } });
	zipDir = dir + '/Zip';

	if (fs.existsSync(zipDir)) {
		fs.rmdirSync(zipDir, { recursive: true });
	}

	fs.mkdirSync(zipDir);
	const stream = fs.createWriteStream(zipDir + '/' + out + '.zip');
	zipFile = zipDir + '/' + out + '.zip';
	return new Promise((resolve, reject) => {
		archive
			.directory(source, false)
			.on('error', (err) => reject(err))
			.pipe(stream);

		stream.on('close', () => resolve());
		archive.finalize();
	});
}

// cron.schedule('* * * * * 1', () => {
for (data of databaseDetails) {
	//checks all data are available in object
	if (
		data.mongoSRV !== '' &&
		data.folderName !== '' &&
		data.BUCKET !== '' &&
		data.S3ACCESSID !== '' &&
		data.S3ACCESSID !== ''
	) {
		// checks root rootDir exists or not if not make the dir
		if (!fs.existsSync(rootDir)) {
			fs.mkdirSync(rootDir);
			// console.log('folder ' + rootDir + '  is created');
		}

		dir = rootDir + '/' + data.folderName;

		//make a dir of database name
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
			// console.log('folder ' + dir + '  is created');
		}

		//check how many backups of a database
		backups = fs.readdirSync(dir);

		if (backups.length === 0) {
			//make a dir of backup 1  name
			timeAndDate = moment().format('ll');
			ndir = dir + '/1 backup ' + timeAndDate;
			fs.mkdirSync(ndir);
			let command = 'cd ' + ndir + '&& mongodump ' + data.mongoSRV;
			const syncDir = cmd.runSync(command);
		} else if (backups.length === 1) {
			//make a dir of backup 1  name
			timeAndDate = moment().format('ll');
			ndir = dir + '/2 backup ' + timeAndDate;
			fs.mkdirSync(ndir);
			let command = 'cd ' + ndir + '&& mongodump ' + data.mongoSRV;
			const syncDir = cmd.runSync(command);
		} else if (backups.length >= 2) {
			// console.log(backups);

			// find index of 1st and second backup

			let oldDirName;
			let newDirName;
			let number1 = -1;
			let number2 = -1;
			for (idx in backups) {
				number1 = backups[idx].split(' ')[0] == 1 ? idx : number1;
				number2 = backups[idx].split(' ')[0] == 2 ? idx : number2;
				// console.log(backups[idx].split(' '));
			}

			//rename backup 1 as old
			oldDirName = dir + '/' + backups[number1];
			newDirName = dir + '/old';
			fs.renameSync(oldDirName, newDirName);

			// //rename backup 2 as 1
			let str = backups[number2].split(' ');
			newDirName = dir + '/1';
			for (s in str) {
				if (s != 0) newDirName += ' ' + str[s];
			}

			oldDirName = dir + '/' + backups[number2];
			fs.renameSync(oldDirName, newDirName);

			//create backup 2
			timeAndDate = moment().format('ll');
			ndir = dir + '/2 backup ' + timeAndDate;
			fs.mkdirSync(ndir);
			let command = 'cd ' + ndir + '&& mongodump ' + data.mongoSRV;
			const syncDir = cmd.runSync(command);

			//delete old db
			if (fs.existsSync(dir + '/old')) {
				fs.rmdirSync(dir + '/old', { recursive: true });
			}
		}

		//create zip of recent backup
		zipDirectory(ndir, moment().format('x'))
			.then((x) => {
				const parameters = {
					TYPE: 'zip',
					KEY: 'databse_backup/' + moment().format('x') + '.zip',
					BUCKET: data.BUCKET,
					S3ACCESSID: data.S3ACCESSID,
					S3ACCESSKEY: data.S3ACCESSKEY,
				};

				uploadOnS3(zipFile, parameters)
					.then((res) => {
						console.log(res);
						if (fs.existsSync(zipDir)) {
							fs.rmdirSync(zipDir, { recursive: true });
						}
					})
					.catch((err) => console.error(err));
			})
			.catch((err) => console.log(err));
	} else {
		console.log('data missing in databaseDetails');
	}
}
// });

app.listen(3001, function () {
	console.log('server is runnig at 3001');
});
