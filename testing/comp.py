data1 = []
with open("test.hex") as file:
    for line in file:
        if line[7:9] != '00':
            continue
        for i in range(9, len(line)-3, 2):
            data1.append(line[i:i+2])

data2 = []
with open("gen.hex") as file:
    for line in file:
        if line[7:9] != '00':
            continue
        for i in range(9, len(line)-3, 2):
            data2.append(line[i:i+2])

if len(data1) == len(data2):
    for i in range(len(data1)):
        if data1[i] != data2[i]:
            print(i, data1[i], data2[i])
