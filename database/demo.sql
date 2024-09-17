insert into Organization (OrganizationId, OrganizationName) values 
(1, 'Demo Company A'),
(2, 'Demo Company B'),
(3, 'Demo Company C');

insert into User (UserId, UserName, Password, OrganizationId) values
(1, 'user1@demo.a', sha2('YJ.s;J3T', 256), 1),
(2, 'user1@demo.b', sha2('g)4LOJ:q', 256), 2),
(3, 'user1@demo.c', sha2('K.1<Nxuy', 256), 3);

update Organization set PublicKey = '-----BEGIN RSA PUBLIC KEY-----\nMIIBBgKB/gDrbJeTBIC4Eg+vYotR+nT6yfzHXe84G3iN1T6OnRDJV7yuttTYShjW\niKdVf87j2+19DZtd8Dusd5eBmGxzM3QMz9CGquxsfoScBnK2r9a8IzXgbLyvdzn3\nKmZ+lHSLSQzPFdCdpnwAeFKmmIyjHm41e0crkvo25qOXwAoCTjlMMZOTrmsc3q/S\nR+Bf6U9FGdQLf1gjKr9styAwXsYhhw1dB+irfCXE0ilJ28LooTQpkddtgPaDrsRy\nzYQZXeZrP1JQ5YuQRG2ccKWiy+TFlz3n+w/QJtINGRdhaqh9fONPXQcHdRD/jvVN\n+FYTpMkRxhWR9spCXHZVazKgAIgHAgMBAAE=\n-----END RSA PUBLIC KEY-----' where OrganizationId = 1;
update Organization set PublicKey = '-----BEGIN RSA PUBLIC KEY-----\nMIIBBgKB/gDDNYHE9kPvnld9zyOK/x74V6+0Y52T6WfKaKRefJ+mPIIrALBb9p6T\nk97OVoBzaGnQOOzZGXVc+siyxmHAUv7Hvj5F2RDQKS7NWIZ3vGK8lZ8LOAxUMLkz\nyDzpDPotla13fW6NXF9ixkIf99aT75HDQN3lzJprEMfo7NrLOJga1d4I5FvciWHq\ntHJlp/bSfD/v62//QUP4Y8ydAKJenUb+2xKEaLsjerxfqbvNHkEemccn87/IUBwe\nBQRTZbQhN6iUwYdlVBT40IvJ092CINRdA44jVOYBF+x+I4U/u9JKE6fuE0cb7GU2\nFXw63TlJGq3iG0hNp/eQcYPcT5kbAgMBAAE=\n-----END RSA PUBLIC KEY-----' where OrganizationId = 2;
update Organization set PublicKey = '-----BEGIN RSA PUBLIC KEY-----\nMIIBBgKB/gDOvNNAig18EWn4iUIU4OOOx/OWtSIDBziTr3qnng5NTAp/zF64FRi/\n8l+erkDpt2AwkoV62HigTdhwQmKhGQh4sgJe+KKkhZjED0GiHMj6mvUQqPbb8GnC\nNkhBJBzoKlFauO5XWIG1zV+XpfPqRUHimKMVlYhyPE2RycWUsekwRsF9tuABGQMG\n7BTIlWkbieX/JEHWhwwoHspuC2SlHQrMpCe8oil//VbXnQtaC2UrkdP9S6ms1c32\nkY8JZlt3T6xLNqLpENnu+TTJCFmjzBOu1lsGpPjokwXwcERcBrFezOCvexAqzm43\nGXy4TZZlDTPagQ+Zo2+I9wprkpXJAgMBAAE=\n-----END RSA PUBLIC KEY-----' where OrganizationId = 3;